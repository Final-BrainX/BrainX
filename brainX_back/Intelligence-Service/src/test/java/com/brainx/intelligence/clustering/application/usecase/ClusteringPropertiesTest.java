package com.brainx.intelligence.clustering.application.usecase;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ClusteringPropertiesTest {

    @Test
    void incrementalDefaultsAndBoundsAreStable() {
        ClusteringProperties properties = new ClusteringProperties();

        assertThat(properties.getExistingFitMinConfidence()).isEqualTo(0.75d);
        assertThat(properties.getIncrementalMaxTotalClusters()).isEqualTo(12);

        properties.setExistingFitMinConfidence(2.0d);
        properties.setIncrementalMaxTotalClusters(99);
        assertThat(properties.getExistingFitMinConfidence()).isEqualTo(1.0d);
        assertThat(properties.getIncrementalMaxTotalClusters()).isEqualTo(12);

        properties.setExistingFitMinConfidence(-1.0d);
        properties.setIncrementalMaxTotalClusters(0);
        assertThat(properties.getExistingFitMinConfidence()).isZero();
        assertThat(properties.getIncrementalMaxTotalClusters()).isEqualTo(1);
    }
}
