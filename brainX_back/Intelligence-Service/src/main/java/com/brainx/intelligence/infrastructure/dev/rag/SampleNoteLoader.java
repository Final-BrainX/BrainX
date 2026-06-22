package com.brainx.intelligence.infrastructure.dev.rag;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Stream;

import org.springframework.stereotype.Component;

@Component
public class SampleNoteLoader {

    List<SampleNoteSnapshot> load(SampleRagProperties properties) {
        Path directory = properties.getDirectory();
        if (directory == null || !Files.isDirectory(directory)) {
            throw new IllegalStateException("sample_notes directory is not available: " + directory);
        }

        try (Stream<Path> paths = Files.walk(directory)) {
            return paths
                .filter(Files::isRegularFile)
                .filter(path -> path.getFileName().toString().endsWith(".md"))
                .sorted(Comparator.comparing(path -> relativePath(directory, path)))
                .map(path -> readSnapshot(properties, directory, path))
                .toList();
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to load sample_notes directory.", exception);
        }
    }

    private static SampleNoteSnapshot readSnapshot(SampleRagProperties properties, Path directory, Path path) {
        try {
            String markdown = Files.readString(path, StandardCharsets.UTF_8);
            String relativePath = relativePath(directory, path);
            String markdownHash = sha256(markdown);
            return new SampleNoteSnapshot(
                properties.getUserId(),
                properties.getDocumentGroupId(),
                "sample-" + sha256(relativePath).substring(0, 16),
                title(path, markdown),
                relativePath,
                filename(path),
                markdown,
                markdownHash,
                Files.getLastModifiedTime(path).toInstant()
            );
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to read sample note: " + path, exception);
        }
    }

    private static String relativePath(Path directory, Path path) {
        return directory.relativize(path).toString().replace('\\', '/');
    }

    private static String title(Path path, String markdown) {
        String frontmatterTitle = frontmatterTitle(markdown);
        if (frontmatterTitle != null) {
            return frontmatterTitle;
        }
        for (String line : markdown.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.matches("^#\\s+.*")) {
                String heading = trimmed.replaceFirst("^#\\s+", "").trim();
                if (!heading.isBlank()) {
                    return heading;
                }
            }
        }
        return filenameStem(path);
    }

    private static String frontmatterTitle(String markdown) {
        String[] lines = markdown.split("\\R");
        if (lines.length < 3 || !"---".equals(lines[0].trim())) {
            return null;
        }
        for (int index = 1; index < lines.length; index++) {
            String trimmed = lines[index].trim();
            if ("---".equals(trimmed)) {
                return null;
            }
            if (trimmed.startsWith("title:")) {
                String title = trimmed.substring("title:".length()).trim();
                title = title.replaceFirst("^['\"]", "").replaceFirst("['\"]$", "").trim();
                return title.isBlank() ? null : title;
            }
        }
        return null;
    }

    private static String filename(Path path) {
        return path.getFileName().toString();
    }

    private static String filenameStem(Path path) {
        String filename = path.getFileName().toString();
        return filename.endsWith(".md") ? filename.substring(0, filename.length() - 3) : filename;
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available.", exception);
        }
    }

    record SampleNoteSnapshot(
        String userId,
        String documentGroupId,
        String noteId,
        String title,
        String relativePath,
        String filename,
        String markdown,
        String markdownHash,
        Instant updatedAt
    ) {
    }
}
