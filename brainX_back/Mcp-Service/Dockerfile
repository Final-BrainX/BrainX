# syntax=docker/dockerfile:1.7
FROM gradle:8.14.3-jdk21-alpine AS build
WORKDIR /workspace

COPY build.gradle settings.gradle ./
COPY gradle ./gradle
COPY gradlew gradlew.bat ./
COPY src ./src

RUN --mount=type=cache,target=/home/gradle/.gradle/caches,uid=1000,gid=1000 \
    --mount=type=cache,target=/home/gradle/.gradle/wrapper,uid=1000,gid=1000 \
    gradle clean bootJar --no-daemon

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

COPY --from=build /workspace/build/libs/*.jar app.jar

EXPOSE 8087
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
