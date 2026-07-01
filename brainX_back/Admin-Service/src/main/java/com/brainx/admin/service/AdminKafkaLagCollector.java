package com.brainx.admin.service;

import com.brainx.admin.dto.AdminDtos.KafkaLagState;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class AdminKafkaLagCollector {
    private static final Logger log = LoggerFactory.getLogger(AdminKafkaLagCollector.class);

    @Value("${spring.kafka.bootstrap-servers:localhost:9092}")
    private String kafkaBootstrapServers;

    public AdminKafkaLagObservation collect(String consumerGroupId) {
        if (consumerGroupId == null || consumerGroupId.isBlank()) {
            return new AdminKafkaLagObservation(null, null, KafkaLagState.CONFIG_MISSING, "Kafka consumer group id is not configured");
        }

        Map<String, Object> config = new HashMap<>();
        config.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, kafkaBootstrapServers);
        config.put(AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, 3000);
        config.put(AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, 3000);

        try (AdminClient client = AdminClient.create(config)) {
            Map<TopicPartition, OffsetAndMetadata> committedOffsets = client
                    .listConsumerGroupOffsets(consumerGroupId)
                    .partitionsToOffsetAndMetadata()
                    .get();

            if (committedOffsets == null || committedOffsets.isEmpty()) {
                return new AdminKafkaLagObservation(null, consumerGroupId, KafkaLagState.NO_COMMITTED_OFFSETS, "No committed offsets yet");
            }

            Map<TopicPartition, OffsetSpec> offsetSpecs = committedOffsets.keySet().stream()
                    .collect(Collectors.toMap(partition -> partition, partition -> OffsetSpec.latest()));
            Map<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> latestOffsets = client.listOffsets(offsetSpecs).all().get();

            long totalLag = 0L;
            for (Map.Entry<TopicPartition, OffsetAndMetadata> entry : committedOffsets.entrySet()) {
                TopicPartition partition = entry.getKey();
                long committedOffset = entry.getValue() != null ? entry.getValue().offset() : 0L;
                ListOffsetsResult.ListOffsetsResultInfo endOffsetInfo = latestOffsets.get(partition);
                long endOffset = endOffsetInfo != null ? endOffsetInfo.offset() : committedOffset;
                totalLag += Math.max(0L, endOffset - committedOffset);
            }

            int kafkaLagMessages = totalLag > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) totalLag;
            String detail = kafkaLagMessages == 0
                    ? "No current backlog"
                    : "Current lag " + kafkaLagMessages + " msgs";
            return new AdminKafkaLagObservation(kafkaLagMessages, consumerGroupId, KafkaLagState.HEALTHY, detail);
        } catch (Exception exception) {
            log.warn("Kafka lag collection failed for group {}: {}", consumerGroupId, exception.getMessage());
            return new AdminKafkaLagObservation(null, consumerGroupId, KafkaLagState.BROKER_UNREACHABLE, "Kafka broker unavailable or offset lookup failed");
        }
    }
}

record AdminKafkaLagObservation(Integer messages, String consumerGroupId, KafkaLagState state, String detail) {
}
