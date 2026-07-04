# syntax=docker/dockerfile:1.7
FROM gradle:8.14.3-jdk21-alpine AS build
WORKDIR /workspace

COPY build.gradle settings.gradle ./
COPY gradle ./gradle
COPY gradlew gradlew.bat ./
COPY src ./src

#RUN gradle clean bootJar -x test --no-daemon
RUN --mount=type=cache,target=/home/gradle/.gradle/caches,uid=1000,gid=1000,sharing=locked \
    --mount=type=cache,target=/home/gradle/.gradle/wrapper,uid=1000,gid=1000,sharing=locked \
    gradle clean bootJar --no-daemon

FROM eclipse-temurin:21-jre-alpine
RUN apk add --no-cache \
    fontconfig \
    ttf-dejavu \
    font-noto \
    font-noto-cjk \
    && fc-cache -f
WORKDIR /app

COPY --from=build /workspace/build/libs/*.jar app.jar

EXPOSE 8083
ENTRYPOINT ["java", "-Djava.awt.headless=true", "-jar", "/app/app.jar"]
