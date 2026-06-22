package com.brainx.intelligence.shared.domain;

public final class DocumentGroups {

    public static final String DEFAULT_DOCUMENT_GROUP_ID = "default";

    private DocumentGroups() {
    }

    public static String normalize(String documentGroupId) {
        if (documentGroupId == null || documentGroupId.isBlank()) {
            return DEFAULT_DOCUMENT_GROUP_ID;
        }
        return documentGroupId.trim();
    }
}
