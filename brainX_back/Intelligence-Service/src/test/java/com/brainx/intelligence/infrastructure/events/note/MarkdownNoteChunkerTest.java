package com.brainx.intelligence.infrastructure.events.note;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

class MarkdownNoteChunkerTest {

    @Test
    void preservesHeadingAndParagraphBoundariesWhenTheyFit() {
        MarkdownNoteChunker chunker = new MarkdownNoteChunker(120, 20, 10);

        var chunks = chunker.chunk(
            "user-1",
            "note-1",
            "Title",
            "# Heading One\n\nFirst paragraph.\n\n## Heading Two\n\nSecond paragraph.",
            List.of("tag-1"),
            "hash-1",
            1
        );

        assertThat(chunks).hasSize(1);
        assertThat(chunks.getFirst().chunkText())
            .contains("Title")
            .contains("Heading One")
            .contains("First paragraph")
            .contains("Heading Two")
            .contains("Second paragraph");
    }

    @Test
    void splitsLongParagraphWithOverlap() {
        MarkdownNoteChunker chunker = new MarkdownNoteChunker(80, 10, 10);
        String longParagraph = "abcdefghij".repeat(20);

        var chunks = chunker.chunk(
            "user-1",
            "note-1",
            "Title",
            longParagraph,
            List.of(),
            "hash-1",
            1
        );

        assertThat(chunks).hasSizeGreaterThan(1);
        assertThat(chunks.get(0).chunkText().length()).isLessThanOrEqualTo(80);
        assertThat(chunks.get(1).chunkText()).contains("abcdefghij");
        assertThat(chunks.get(1).chunkIndex()).isEqualTo(1);
    }

    @Test
    void emptyMarkdownCreatesTitleOnlyChunk() {
        MarkdownNoteChunker chunker = new MarkdownNoteChunker();

        var chunks = chunker.chunk("user-1", "note-1", "Only title", "", List.of(), null, 1);

        assertThat(chunks).hasSize(1);
        assertThat(chunks.getFirst().chunkText()).isEqualTo("Only title");
        assertThat(chunks.getFirst().chunkIndex()).isZero();
    }

    @Test
    void stopsAtMaxChunkCount() {
        MarkdownNoteChunker chunker = new MarkdownNoteChunker(40, 5, 2);

        var chunks = chunker.chunk(
            "user-1",
            "note-1",
            "Title",
            "paragraph ".repeat(100),
            List.of(),
            "hash-1",
            1
        );

        assertThat(chunks).hasSize(2);
    }
}
