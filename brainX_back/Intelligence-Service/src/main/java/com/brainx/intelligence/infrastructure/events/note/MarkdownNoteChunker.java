package com.brainx.intelligence.infrastructure.events.note;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Component;

import com.brainx.intelligence.exploration.domain.NoteSearchDocument;

@Component
public class MarkdownNoteChunker {

    static final int DEFAULT_MAX_CHUNK_LENGTH = 1200;
    static final int DEFAULT_OVERLAP_LENGTH = 150;
    static final int DEFAULT_MAX_CHUNKS = 80;
    private static final int EXCERPT_LENGTH = 240;

    private final int maxChunkLength;
    private final int overlapLength;
    private final int maxChunks;

    public MarkdownNoteChunker() {
        this(DEFAULT_MAX_CHUNK_LENGTH, DEFAULT_OVERLAP_LENGTH, DEFAULT_MAX_CHUNKS);
    }

    MarkdownNoteChunker(int maxChunkLength, int overlapLength, int maxChunks) {
        if (maxChunkLength <= 0) {
            throw new IllegalArgumentException("maxChunkLength must be positive.");
        }
        if (overlapLength < 0 || overlapLength >= maxChunkLength) {
            throw new IllegalArgumentException("overlapLength must be non-negative and smaller than maxChunkLength.");
        }
        if (maxChunks <= 0) {
            throw new IllegalArgumentException("maxChunks must be positive.");
        }
        this.maxChunkLength = maxChunkLength;
        this.overlapLength = overlapLength;
        this.maxChunks = maxChunks;
    }

    public List<NoteSearchDocument> chunk(
        String userId,
        String noteId,
        String title,
        String markdown,
        List<String> keywordIds,
        String markdownHash,
        Integer version
    ) {
        String normalizedTitle = normalize(title);
        List<String> bodies = chunkBodies(normalizedTitle, parseBlocks(markdown));
        if (bodies.isEmpty()) {
            bodies = List.of(normalizedTitle);
        }

        List<NoteSearchDocument> chunks = new ArrayList<>();
        for (int index = 0; index < bodies.size() && index < maxChunks; index++) {
            String chunkText = withTitlePrefix(normalizedTitle, bodies.get(index));
            chunks.add(new NoteSearchDocument(
                userId,
                noteId,
                noteId + "::" + index,
                index,
                normalizedTitle,
                excerpt(chunkText),
                chunkText,
                keywordIds,
                markdownHash,
                version
            ));
        }
        return chunks;
    }

    private List<String> chunkBodies(String title, List<String> blocks) {
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String block : blocks) {
            if (block.isBlank()) {
                continue;
            }
            if (fits(title, current, block)) {
                appendBlock(current, block);
                continue;
            }
            flush(chunks, current);
            if (withTitlePrefix(title, block).length() <= maxChunkLength) {
                appendBlock(current, block);
            } else {
                chunks.addAll(splitLongBlock(title, block));
            }
            if (chunks.size() >= maxChunks) {
                return chunks.subList(0, maxChunks);
            }
        }
        flush(chunks, current);
        if (chunks.size() > maxChunks) {
            return chunks.subList(0, maxChunks);
        }
        return chunks;
    }

    private boolean fits(String title, StringBuilder current, String block) {
        if (current.isEmpty()) {
            return withTitlePrefix(title, block).length() <= maxChunkLength;
        }
        return withTitlePrefix(title, current + "\n\n" + block).length() <= maxChunkLength;
    }

    private static void appendBlock(StringBuilder builder, String block) {
        if (!builder.isEmpty()) {
            builder.append("\n\n");
        }
        builder.append(block);
    }

    private static void flush(List<String> chunks, StringBuilder builder) {
        if (!builder.isEmpty()) {
            chunks.add(builder.toString());
            builder.setLength(0);
        }
    }

    private List<String> splitLongBlock(String title, String block) {
        List<String> chunks = new ArrayList<>();
        int maxBodyLength = Math.max(1, maxChunkLength - title.length() - 2);
        int start = 0;
        while (start < block.length() && chunks.size() < maxChunks) {
            int end = Math.min(block.length(), start + maxBodyLength);
            chunks.add(block.substring(start, end).trim());
            if (end == block.length()) {
                break;
            }
            start = Math.max(start + 1, end - overlapLength);
        }
        return chunks;
    }

    private static List<String> parseBlocks(String markdown) {
        if (markdown == null || markdown.isBlank()) {
            return List.of();
        }
        List<String> blocks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String rawLine : markdown.split("\\R")) {
            String line = rawLine.trim();
            if (line.isBlank()) {
                flushNormalized(blocks, current);
                continue;
            }
            if (isHeading(line)) {
                flushNormalized(blocks, current);
                blocks.add(normalize(line));
                continue;
            }
            if (!current.isEmpty()) {
                current.append('\n');
            }
            current.append(line);
        }
        flushNormalized(blocks, current);
        return blocks;
    }

    private static boolean isHeading(String line) {
        return line.startsWith("#");
    }

    private static void flushNormalized(List<String> blocks, StringBuilder builder) {
        if (!builder.isEmpty()) {
            String block = normalize(builder.toString());
            if (!block.isBlank()) {
                blocks.add(block);
            }
            builder.setLength(0);
        }
    }

    private static String withTitlePrefix(String title, String body) {
        if (body == null || body.isBlank() || body.equals(title)) {
            return title;
        }
        if (title == null || title.isBlank()) {
            return body;
        }
        return title + "\n\n" + body;
    }

    private static String normalize(String value) {
        if (value == null) {
            return "";
        }
        return value
            .replaceAll("[#>*_`\\[\\]()]", " ")
            .replaceAll("\\s+", " ")
            .trim();
    }

    private static String excerpt(String value) {
        if (value == null || value.length() <= EXCERPT_LENGTH) {
            return value == null ? "" : value;
        }
        return value.substring(0, EXCERPT_LENGTH).trim();
    }
}
