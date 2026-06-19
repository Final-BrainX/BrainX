package com.brainx.intelligence.devui;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

@Service
@Profile("dev-ui")
class DevFixtureService {

    String loadFixture(String fixtureName) {
        var resource = new ClassPathResource("dev-ui-fixtures/" + fixtureName + ".json");
        if (!resource.exists()) {
            return "{\n  \"error\": \"Fixture not found: " + fixtureName + "\"\n}";
        }

        try (var inputStream = resource.getInputStream()) {
            return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            return "{\n  \"error\": \"Could not load fixture: " + fixtureName + "\"\n}";
        }
    }
}
