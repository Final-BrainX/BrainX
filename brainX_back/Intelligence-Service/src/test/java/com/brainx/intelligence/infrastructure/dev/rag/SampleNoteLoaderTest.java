package com.brainx.intelligence.infrastructure.dev.rag;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SampleNoteLoaderTest {

    @TempDir
    private Path tempDir;

    @Test
    void loadsMarkdownFilesAsStableSnapshots() throws Exception {
        Files.writeString(tempDir.resolve("note.md"), "# BrainX RAG\n\nsemantic search content");

        SampleRagProperties properties = new SampleRagProperties();
        properties.setDirectory(tempDir);
        properties.setUserId("user-1");
        SampleNoteLoader loader = new SampleNoteLoader();

        var first = loader.load(properties);
        var second = loader.load(properties);

        assertThat(first).hasSize(1);
        assertThat(first.getFirst().userId()).isEqualTo("user-1");
        assertThat(first.getFirst().title()).isEqualTo("BrainX RAG");
        assertThat(first.getFirst().relativePath()).isEqualTo("note.md");
        assertThat(first.getFirst().noteId()).startsWith("sample-");
        assertThat(first.getFirst().noteId()).isEqualTo(second.getFirst().noteId());
        assertThat(first.getFirst().markdownHash()).hasSize(64);
    }

    @Test
    void usesFilenameWhenHeadingIsMissing() throws Exception {
        Files.writeString(tempDir.resolve("plain.md"), "content without heading");

        SampleRagProperties properties = new SampleRagProperties();
        properties.setDirectory(tempDir);

        var snapshots = new SampleNoteLoader().load(properties);

        assertThat(snapshots.getFirst().title()).isEqualTo("plain");
    }
}
