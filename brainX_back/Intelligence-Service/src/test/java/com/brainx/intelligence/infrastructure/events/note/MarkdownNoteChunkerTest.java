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
    void stripsHtmlTagsAndEntitiesFromChunkTextAndExcerpt() {
        MarkdownNoteChunker chunker = new MarkdownNoteChunker(120, 20, 10);

        var chunks = chunker.chunk(
            "user-1",
            "note-1",
            "<span>제주&nbsp;여행</span>",
            "<p><strong>제주 여행</strong><br>렌터카&nbsp;&amp;&nbsp;우도</p>\n\n&lt;p&gt;비 오는 날&lt;/p&gt;",
            List.of(),
            "hash-1",
            1
        );

        assertThat(chunks).hasSize(1);
        assertThat(chunks.getFirst().chunkText())
            .contains("제주 여행")
            .contains("렌터카 & 우도")
            .contains("비 오는 날")
            .doesNotContain("<span>", "<p>", "</p>", "<strong>", "<br>", "&nbsp;", "&lt;");
        assertThat(chunks.getFirst().excerpt())
            .doesNotContain("<span>", "<p>", "</p>", "<strong>", "<br>", "&nbsp;", "&lt;");
    }

    @Test
    void preservesAngleBracketTextThatIsNotHtmlTag() {
        MarkdownNoteChunker chunker = new MarkdownNoteChunker(120, 20, 10);

        var chunks = chunker.chunk(
            "user-1",
            "note-1",
            "Comparison",
            "A &lt; B &amp; C &gt; D\n\nX < Y & Z > W\n\nx&lt;y&gt;z List&lt;T&gt;\n\nraw x<y>z List<T>",
            List.of(),
            "hash-1",
            1
        );

        assertThat(chunks).hasSize(1);
        assertThat(chunks.getFirst().chunkText())
            .contains("A < B & C > D")
            .contains("X < Y & Z > W")
            .contains("x<y>z List<T>")
            .contains("raw x<y>z List<T>");
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

    @Test
    void stableChunkTextKeepsChunkIdWhenEarlierContentIsInserted() {
        MarkdownNoteChunker chunker = new MarkdownNoteChunker(30, 5, 10);

        var original = chunker.chunk(
            "user-1",
            "note-1",
            "Title",
            "Stable paragraph.",
            List.of(),
            "hash-1",
            1
        );
        var changed = chunker.chunk(
            "user-1",
            "note-1",
            "Title",
            "Inserted paragraph.\n\nStable paragraph.",
            List.of(),
            "hash-2",
            2
        );

        String stableOriginalId = original.stream()
            .filter(chunk -> chunk.chunkText().contains("Stable paragraph"))
            .findFirst()
            .orElseThrow()
            .chunkId();
        String stableChangedId = changed.stream()
            .filter(chunk -> chunk.chunkText().contains("Stable paragraph"))
            .findFirst()
            .orElseThrow()
            .chunkId();

        assertThat(stableChangedId).isEqualTo(stableOriginalId);
    }

    @Test
    void duplicateChunkTextUsesOrdinalSuffix() {
        MarkdownNoteChunker chunker = new MarkdownNoteChunker(20, 5, 10);

        var chunks = chunker.chunk(
            "user-1",
            "note-1",
            "Title",
            "same block\n\nsame block",
            List.of(),
            "hash-1",
            1
        );

        assertThat(chunks).hasSize(2);
        assertThat(chunks.get(0).chunkId()).endsWith("::0");
        assertThat(chunks.get(1).chunkId()).endsWith("::1");
        assertThat(chunks.get(0).chunkId().replace("::0", ""))
            .isEqualTo(chunks.get(1).chunkId().replace("::1", ""));
    }

    @Test
    void titleChangeChangesChunkIdBecauseTitleIsEmbedded() {
        MarkdownNoteChunker chunker = new MarkdownNoteChunker(80, 10, 10);

        var original = chunker.chunk("user-1", "note-1", "Old title", "same body", List.of(), "hash-1", 1);
        var changed = chunker.chunk("user-1", "note-1", "New title", "same body", List.of(), "hash-2", 2);

        assertThat(changed.getFirst().chunkId()).isNotEqualTo(original.getFirst().chunkId());
    }
}
