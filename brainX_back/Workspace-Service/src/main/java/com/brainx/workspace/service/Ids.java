package com.brainx.workspace.service;

import java.util.UUID;

final class Ids {
    private Ids() {
    }

    static String note() {
        return "note_" + UUID.randomUUID();
    }

    static String folder() {
        return "fld_" + UUID.randomUUID();
    }

    static String workspace() {
        return "dgrp_" + UUID.randomUUID();
    }

    static String link() {
        return "lnk_" + UUID.randomUUID();
    }

    static String share() {
        return "shr_" + UUID.randomUUID();
    }

    static String favorite(String userId, String targetType, String targetId) {
        return userId + "_" + targetType + "_" + targetId;
    }

    static String version(String noteId, int version) {
        return noteId + "_v" + version;
    }

    static String activity() {
        return "act_" + UUID.randomUUID();
    }
}
