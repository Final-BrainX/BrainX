package com.brainx.intelligence.clustering.application.usecase;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.clustering.application.port.inbound.InheritClusterUseCase;
import com.brainx.intelligence.clustering.application.port.outbound.ClusterJobStore;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort.ClusterJobCompletedEvent;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringEventPort.ClusterJobRequestedEvent;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringNoteSourcePort;
import com.brainx.intelligence.clustering.domain.Cluster;
import com.brainx.intelligence.clustering.domain.ClusterJob;
import com.brainx.intelligence.clustering.domain.ClusterJobStatus;
import com.brainx.intelligence.clustering.domain.ClusteringConflictException;
import com.brainx.intelligence.clustering.domain.ClusteringNotFoundException;
import com.brainx.intelligence.shared.application.port.outbound.KnowledgeAnalysisNoteSourcePort.KnowledgeAnalysisNote;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;
import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort.NoteSnapshot;

@Service
public class ClusterInheritanceService implements InheritClusterUseCase {

    private static final int LATEST_JOB_LOOKBACK = 20;

    private final ClusterJobStore clusterJobStore;
    private final ClusteringNoteSourcePort noteSourcePort;
    private final WorkspaceNotePort workspaceNotePort;
    private final ClusteringEventPort eventPort;
    private final ClusteringProperties properties;
    private final Clock clock;

    @Autowired
    public ClusterInheritanceService(
        ClusterJobStore clusterJobStore,
        ClusteringNoteSourcePort noteSourcePort,
        WorkspaceNotePort workspaceNotePort,
        ClusteringEventPort eventPort,
        ClusteringProperties properties
    ) {
        this(clusterJobStore, noteSourcePort, workspaceNotePort, eventPort, properties, Clock.systemUTC());
    }

    ClusterInheritanceService(
        ClusterJobStore clusterJobStore,
        ClusteringNoteSourcePort noteSourcePort,
        WorkspaceNotePort workspaceNotePort,
        ClusteringEventPort eventPort,
        ClusteringProperties properties,
        Clock clock
    ) {
        this.clusterJobStore = clusterJobStore;
        this.noteSourcePort = noteSourcePort;
        this.workspaceNotePort = workspaceNotePort;
        this.eventPort = eventPort;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    @Transactional
    public ClusterInheritanceResult inheritCluster(ClusterInheritanceCommand command) {
        String userId = requireText(command.userId(), "userId");
        String documentGroupId = requireText(command.documentGroupId(), "documentGroupId");
        String noteId = requireText(command.noteId(), "noteId");
        List<String> sourceNoteIds = normalizeSourceNoteIds(command.sourceNoteIds());
        ClusterJob baseline = latestCompletedWorkspaceJob(userId, documentGroupId);
        if (baseline == null) {
            return new ClusterInheritanceResult(false, noteId, null, null);
        }
        Cluster target = sameSourceCluster(baseline.clusters(), sourceNoteIds);
        if (target == null) {
            return new ClusterInheritanceResult(false, noteId, null, null);
        }
        Cluster current = clusterContaining(baseline.clusters(), noteId);
        if (current != null) {
            if (!current.clusterId().equals(target.clusterId())) {
                throw new ClusteringConflictException("Bridge note already belongs to another cluster.");
            }
            return new ClusterInheritanceResult(true, noteId, current.clusterId(), baseline.clusterJobId());
        }

        NoteSnapshot snapshot = workspaceNotePort.getNoteSnapshot(noteId);
        if (!userId.equals(snapshot.userId()) || !documentGroupId.equals(snapshot.documentGroupId())) {
            throw new ClusteringNotFoundException("Bridge note is not available in the requested workspace.");
        }
        List<KnowledgeAnalysisNote> notes = new ArrayList<>(noteSourcePort.findClusteringSourceNotes(
            userId,
            documentGroupId,
            properties.getMaxNotes()
        ));
        if (notes.stream().noneMatch(note -> note.noteId().equals(noteId))) {
            notes.add(toAnalysisNote(snapshot));
        }

        List<Cluster> clusters = baseline.clusters().stream().map(cluster -> {
            if (!cluster.clusterId().equals(target.clusterId())) {
                return cluster;
            }
            LinkedHashSet<String> memberIds = new LinkedHashSet<>(cluster.noteIds());
            memberIds.add(noteId);
            return new Cluster(
                cluster.clusterId(),
                cluster.title(),
                cluster.summary(),
                List.copyOf(memberIds),
                cluster.keywords(),
                cluster.confidence()
            );
        }).toList();
        String jobId = UUID.randomUUID().toString();
        Instant now = Instant.now(clock);
        Map<String, Object> scope = publicScope(baseline.scope());
        scope.put(ClusteringService.SOURCE_SNAPSHOT_SCOPE_KEY, sourceSnapshot(notes));
        Map<String, Object> algorithmOptions = new LinkedHashMap<>(baseline.algorithmOptions());
        algorithmOptions.put("mode", "BRIDGE_INHERITANCE");
        algorithmOptions.put("baselineClusterJobId", baseline.clusterJobId());
        ClusterJob running = clusterJobStore.save(ClusterJob.running(
            jobId,
            userId,
            documentGroupId,
            scope,
            algorithmOptions,
            baseline.modelId(),
            null,
            now
        ));
        eventPort.clusterJobRequested(new ClusterJobRequestedEvent(userId, jobId, publicScope(scope), algorithmOptions));
        ClusterJob completed = clusterJobStore.save(running.completed(clusters, Instant.now(clock)));
        eventPort.clusterJobCompleted(new ClusterJobCompletedEvent(userId, jobId, clusters.size()));
        return new ClusterInheritanceResult(true, noteId, target.clusterId(), completed.clusterJobId());
    }

    private ClusterJob latestCompletedWorkspaceJob(String userId, String documentGroupId) {
        return clusterJobStore.findRecentByUserIdAndDocumentGroupId(userId, documentGroupId, LATEST_JOB_LOOKBACK).stream()
            .filter(job -> job.status() == ClusterJobStatus.COMPLETED)
            .filter(job -> !hasScopedNoteIds(job.scope()))
            .findFirst()
            .orElse(null);
    }

    private static Cluster sameSourceCluster(List<Cluster> clusters, List<String> sourceNoteIds) {
        Cluster first = clusterContaining(clusters, sourceNoteIds.get(0));
        Cluster second = clusterContaining(clusters, sourceNoteIds.get(1));
        return first != null && second != null && first.clusterId().equals(second.clusterId()) ? first : null;
    }

    private static Cluster clusterContaining(List<Cluster> clusters, String noteId) {
        return clusters.stream().filter(cluster -> cluster.noteIds().contains(noteId)).findFirst().orElse(null);
    }

    private static List<String> normalizeSourceNoteIds(List<String> sourceNoteIds) {
        if (sourceNoteIds == null) {
            throw new IllegalArgumentException("sourceNoteIds must contain exactly two note IDs.");
        }
        List<String> values = sourceNoteIds.stream()
            .filter(StringUtils::hasText)
            .map(String::trim)
            .distinct()
            .toList();
        if (values.size() != 2) {
            throw new IllegalArgumentException("sourceNoteIds must contain exactly two distinct note IDs.");
        }
        return values;
    }

    private static KnowledgeAnalysisNote toAnalysisNote(NoteSnapshot snapshot) {
        String markdown = snapshot.markdown() == null ? "" : snapshot.markdown();
        List<String> headings = markdown.lines()
            .map(String::trim)
            .filter(line -> line.startsWith("#"))
            .map(line -> line.replaceFirst("^#+\\s*", ""))
            .filter(StringUtils::hasText)
            .limit(20)
            .toList();
        String excerpt = markdown.replaceAll("\\s+", " ").trim();
        if (excerpt.length() > 1200) {
            excerpt = excerpt.substring(0, 1200);
        }
        return new KnowledgeAnalysisNote(
            snapshot.userId(),
            snapshot.documentGroupId(),
            snapshot.noteId(),
            snapshot.title(),
            snapshot.tags(),
            headings,
            excerpt,
            snapshot.updatedAt()
        );
    }

    private static Map<String, Object> sourceSnapshot(List<KnowledgeAnalysisNote> notes) {
        List<Map<String, Object>> sourceNotes = notes.stream()
            .sorted(Comparator.comparing(KnowledgeAnalysisNote::noteId))
            .map(note -> Map.<String, Object>of("noteId", note.noteId(), "updatedAt", note.updatedAt().toString()))
            .toList();
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("noteCount", notes.size());
        snapshot.put("latestNoteUpdatedAt", notes.stream().map(KnowledgeAnalysisNote::updatedAt)
            .max(Instant::compareTo).map(Instant::toString).orElse(null));
        snapshot.put("notes", sourceNotes);
        return snapshot;
    }

    private static Map<String, Object> publicScope(Map<String, Object> scope) {
        Map<String, Object> values = new LinkedHashMap<>(scope == null ? Map.of() : scope);
        values.remove(ClusteringService.SOURCE_SNAPSHOT_SCOPE_KEY);
        return values;
    }

    private static boolean hasScopedNoteIds(Map<String, Object> scope) {
        Object value = scope == null ? null : scope.get("noteIds");
        return value instanceof List<?> noteIds && noteIds.stream()
            .anyMatch(item -> item != null && StringUtils.hasText(item.toString()));
    }

    private static String requireText(String value, String field) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value.trim();
    }
}
