package com.brainx.intelligence.infrastructure.vector.qdrant;

import static io.qdrant.client.ConditionFactory.matchKeyword;
import static io.qdrant.client.PointIdFactory.id;
import static io.qdrant.client.ValueFactory.list;
import static io.qdrant.client.ValueFactory.nullValue;
import static io.qdrant.client.ValueFactory.value;
import static io.qdrant.client.VectorsFactory.vectors;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;

import com.google.common.util.concurrent.ListenableFuture;

import io.qdrant.client.QdrantClient;
import io.qdrant.client.grpc.Collections.Distance;
import io.qdrant.client.grpc.Collections.VectorParams;
import io.qdrant.client.grpc.JsonWithInt.Value;
import io.qdrant.client.grpc.Points.Filter;
import io.qdrant.client.grpc.Points.PointStruct;
import io.qdrant.client.grpc.Points.ScoredPoint;
import io.qdrant.client.grpc.Points.SearchPoints;
import io.qdrant.client.WithPayloadSelectorFactory;
import io.qdrant.client.WithVectorsSelectorFactory;

class DefaultQdrantVectorIndexClient implements QdrantVectorIndexClient {

    private static final String USER_ID = "userId";
    private static final String DOCUMENT_GROUP_ID = "documentGroupId";
    private static final String NOTE_ID = "noteId";

    private final QdrantClient qdrantClient;
    private final QdrantVectorIndexProperties properties;
    private volatile boolean collectionReady;

    DefaultQdrantVectorIndexClient(QdrantClient qdrantClient, QdrantVectorIndexProperties properties) {
        this.qdrantClient = qdrantClient;
        this.properties = properties;
    }

    @Override
    public void upsert(List<QdrantVectorPoint> points) {
        ensureCollection();
        if (points == null || points.isEmpty()) {
            return;
        }
        await(qdrantClient.upsertAsync(
            properties.getCollectionName(),
            points.stream()
                .map(DefaultQdrantVectorIndexClient::toPointStruct)
                .toList(),
            properties.getTimeout()
        ));
    }

    @Override
    public void deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
        ensureCollection();
        await(qdrantClient.deleteAsync(
            properties.getCollectionName(),
            noteFilter(userId, documentGroupId, noteId),
            properties.getTimeout()
        ));
    }

    @Override
    public List<QdrantVectorSearchHit> search(String userId, String documentGroupId, List<Double> vector, int limit) {
        ensureCollection();
        if (vector == null || vector.isEmpty() || limit <= 0) {
            return List.of();
        }
        SearchPoints request = SearchPoints.newBuilder()
            .setCollectionName(properties.getCollectionName())
            .addAllVector(toFloats(vector))
            .setLimit(limit)
            .setFilter(Filter.newBuilder()
                .addMust(matchKeyword(USER_ID, userId))
                .addMust(matchKeyword(DOCUMENT_GROUP_ID, documentGroupId))
                .build())
            .setWithPayload(WithPayloadSelectorFactory.enable(true))
            .setWithVectors(WithVectorsSelectorFactory.enable(false))
            .build();
        return await(qdrantClient.searchAsync(request, properties.getTimeout())).stream()
            .map(DefaultQdrantVectorIndexClient::toSearchHit)
            .toList();
    }

    private void ensureCollection() {
        if (!properties.isInitializeSchema() || collectionReady) {
            return;
        }
        synchronized (this) {
            if (collectionReady) {
                return;
            }
            boolean exists = await(qdrantClient.collectionExistsAsync(
                properties.getCollectionName(),
                properties.getTimeout()
            ));
            if (!exists) {
                await(qdrantClient.createCollectionAsync(
                    properties.getCollectionName(),
                    VectorParams.newBuilder()
                        .setSize(properties.getDimensions())
                        .setDistance(Distance.Cosine)
                        .build(),
                    properties.getTimeout()
                ));
            }
            collectionReady = true;
        }
    }

    private static PointStruct toPointStruct(QdrantVectorPoint point) {
        return PointStruct.newBuilder()
            .setId(id(point.id()))
            .setVectors(vectors(toFloats(point.vector())))
            .putAllPayload(toPayload(point.payload()))
            .build();
    }

    private static Filter noteFilter(String userId, String documentGroupId, String noteId) {
        return Filter.newBuilder()
            .addMust(matchKeyword(USER_ID, userId))
            .addMust(matchKeyword(DOCUMENT_GROUP_ID, documentGroupId))
            .addMust(matchKeyword(NOTE_ID, noteId))
            .build();
    }

    private static QdrantVectorSearchHit toSearchHit(ScoredPoint point) {
        String id = point.hasId() ? point.getId().getUuid() : "";
        return new QdrantVectorSearchHit(id, point.getScore(), toPayloadMap(point.getPayloadMap()));
    }

    private static Map<String, Value> toPayload(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) {
            return Map.of();
        }
        Map<String, Value> values = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : payload.entrySet()) {
            if (entry.getValue() != null) {
                values.put(entry.getKey(), toValue(entry.getValue()));
            }
        }
        return values;
    }

    private static Value toValue(Object value) {
        if (value == null) {
            return nullValue();
        }
        if (value instanceof String text) {
            return value(text);
        }
        if (value instanceof Integer number) {
            return value(number.longValue());
        }
        if (value instanceof Long number) {
            return value(number.longValue());
        }
        if (value instanceof Number number) {
            return value(number.doubleValue());
        }
        if (value instanceof Boolean bool) {
            return value(bool.booleanValue());
        }
        if (value instanceof Iterable<?> iterable) {
            List<Value> values = new ArrayList<>();
            for (Object item : iterable) {
                values.add(toValue(item));
            }
            return list(values);
        }
        return value(value.toString());
    }

    private static Map<String, Object> toPayloadMap(Map<String, Value> payload) {
        if (payload == null || payload.isEmpty()) {
            return Map.of();
        }
        Map<String, Object> values = new LinkedHashMap<>();
        for (Map.Entry<String, Value> entry : payload.entrySet()) {
            Object value = fromValue(entry.getValue());
            if (value != null) {
                values.put(entry.getKey(), value);
            }
        }
        return values;
    }

    private static Object fromValue(Value value) {
        return switch (value.getKindCase()) {
            case STRING_VALUE -> value.getStringValue();
            case INTEGER_VALUE -> value.getIntegerValue();
            case DOUBLE_VALUE -> value.getDoubleValue();
            case BOOL_VALUE -> value.getBoolValue();
            case LIST_VALUE -> value.getListValue().getValuesList().stream()
                .map(DefaultQdrantVectorIndexClient::fromValue)
                .toList();
            case STRUCT_VALUE -> value.getStructValue().getFieldsMap().entrySet().stream()
                .collect(java.util.stream.Collectors.toMap(
                    Map.Entry::getKey,
                    entry -> fromValue(entry.getValue())
                ));
            case NULL_VALUE, KIND_NOT_SET -> null;
        };
    }

    private static List<Float> toFloats(List<Double> vector) {
        if (vector == null || vector.isEmpty()) {
            return List.of();
        }
        return vector.stream()
            .map(Double::floatValue)
            .toList();
    }

    private static <T> T await(ListenableFuture<T> future) {
        try {
            return future.get();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Qdrant operation was interrupted.", exception);
        } catch (ExecutionException exception) {
            throw new IllegalStateException("Qdrant operation failed.", exception.getCause());
        }
    }
}
