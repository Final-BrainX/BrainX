package com.brainx.intelligence.clustering.application.port.outbound;

import java.util.List;

import com.brainx.intelligence.shared.application.port.outbound.KnowledgeAnalysisNoteSourcePort.KnowledgeAnalysisNote;

public interface ClusteringNoteSourcePort {

    List<KnowledgeAnalysisNote> findClusteringSourceNotes(String userId, String documentGroupId, int limit);

    List<KnowledgeAnalysisNote> findClusteringSourceNotesByIds(String userId, String documentGroupId, List<String> noteIds);
}
