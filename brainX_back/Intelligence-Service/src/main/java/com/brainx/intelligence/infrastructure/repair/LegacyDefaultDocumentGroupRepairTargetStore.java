package com.brainx.intelligence.infrastructure.repair;

import java.util.List;

interface LegacyDefaultDocumentGroupRepairTargetStore {

    List<LegacyDefaultDocumentGroupRepairTarget> findPendingVectorCleanupTargets();

    void markVectorCleanupSucceeded(LegacyDefaultDocumentGroupRepairTarget target);

    void markVectorCleanupFailed(LegacyDefaultDocumentGroupRepairTarget target, String errorMessage);
}
