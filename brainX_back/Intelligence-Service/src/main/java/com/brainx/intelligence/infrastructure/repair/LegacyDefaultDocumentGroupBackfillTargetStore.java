package com.brainx.intelligence.infrastructure.repair;

import java.util.List;

interface LegacyDefaultDocumentGroupBackfillTargetStore {

    List<LegacyDefaultDocumentGroupBackfillTarget> findDefaultOnlyProjectionTargets(int limit);
}
