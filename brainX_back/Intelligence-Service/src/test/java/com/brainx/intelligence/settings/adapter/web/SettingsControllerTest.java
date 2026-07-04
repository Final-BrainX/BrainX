package com.brainx.intelligence.settings.adapter.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.brainx.intelligence.infrastructure.security.SecurityConfig;
import com.brainx.intelligence.infrastructure.web.GlobalApiExceptionHandler;
import com.brainx.intelligence.settings.application.port.inbound.GetStyleProfileUseCase;
import com.brainx.intelligence.settings.application.port.inbound.GetStyleProfileUseCase.GetStyleProfileQuery;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase.AiModelView;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase.AiModelsResult;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase.AiPricingPolicyView;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase.ListAiModelsQuery;
import com.brainx.intelligence.settings.application.port.inbound.PutAiModelSettingsUseCase;
import com.brainx.intelligence.settings.application.port.inbound.PutAiModelSettingsUseCase.AiModelSettingsResult;
import com.brainx.intelligence.settings.application.port.inbound.PutAiModelSettingsUseCase.PutAiModelSettingsCommand;
import com.brainx.intelligence.settings.application.port.inbound.PutStyleProfileUseCase;
import com.brainx.intelligence.settings.application.port.inbound.PutStyleProfileUseCase.PutStyleProfileCommand;
import com.brainx.intelligence.settings.domain.UnknownAiModelException;

@WebMvcTest(SettingsController.class)
@Import({SecurityConfig.class, GlobalApiExceptionHandler.class})
class SettingsControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ListAiModelsUseCase listAiModelsUseCase;

    @MockitoBean
    private PutAiModelSettingsUseCase putAiModelSettingsUseCase;

    @MockitoBean
    private GetStyleProfileUseCase getStyleProfileUseCase;

    @MockitoBean
    private PutStyleProfileUseCase putStyleProfileUseCase;

    @Test
    void listAiModelsMatchesOpenApiContract() throws Exception {
        when(listAiModelsUseCase.listAiModels(any(ListAiModelsQuery.class)))
            .thenReturn(new AiModelsResult(
                List.of(new AiModelView(
                    "gpt-4o-mini",
                    "GPT-4o mini",
                    "openai",
                    new BigDecimal("0.150000"),
                    new BigDecimal("0.075000"),
                    new BigDecimal("0.600000"),
                    "USD",
                    true
                )),
                List.of("gpt-4o-mini"),
                new AiPricingPolicyView("TOKEN", "", Map.of())
            ));

        mockMvc.perform(get("/api/v1/ai/models").with(user("user-1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.message").value("Success"))
            .andExpect(jsonPath("$.data.models[0].modelId").value("gpt-4o-mini"))
            .andExpect(jsonPath("$.data.models[0].name").value("GPT-4o mini"))
            .andExpect(jsonPath("$.data.models[0].provider").value("openai"))
            .andExpect(jsonPath("$.data.models[0].vendorInputCostPer1kTokens").value(0.150000))
            .andExpect(jsonPath("$.data.models[0].vendorCachedInputCostPer1kTokens").value(0.075000))
            .andExpect(jsonPath("$.data.models[0].vendorOutputCostPer1kTokens").value(0.600000))
            .andExpect(jsonPath("$.data.models[0].costCurrency").value("USD"))
            .andExpect(jsonPath("$.data.models[0].enabled").value(true))
            .andExpect(jsonPath("$.data.models[0].costPer1kTokens").doesNotExist())
            .andExpect(jsonPath("$.data.enabledModels[0]").value("gpt-4o-mini"))
            .andExpect(jsonPath("$.data.costInfo.billingUnit").value("TOKEN"));

        verify(listAiModelsUseCase).listAiModels(argThat(query -> query.userId().equals("user-1")));
    }

    @Test
    void putAiModelSettingsMatchesOpenApiContract() throws Exception {
        when(putAiModelSettingsUseCase.putAiModelSettings(any(PutAiModelSettingsCommand.class)))
            .thenReturn(new AiModelSettingsResult(Map.of(
                "defaultModelId", "gpt-4o-mini",
                "userApiKeys", Map.of("openai", Map.of("masked", true))
            )));

        mockMvc.perform(put("/api/v1/ai/model-settings")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "defaultModelId": "gpt-4o-mini",
                      "userApiKeys": {
                        "openai": {
                          "masked": true
                        }
                      }
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.settings.defaultModelId").value("gpt-4o-mini"))
            .andExpect(jsonPath("$.data.settings.userApiKeys.openai.masked").value(true));

        verify(putAiModelSettingsUseCase).putAiModelSettings(argThat(command ->
            command.userId().equals("user-1")
                && command.defaultModelId().equals("gpt-4o-mini")
                && command.userApiKeys().containsKey("openai")
        ));
    }

    @Test
    void getStyleProfileMatchesOpenApiContract() throws Exception {
        when(getStyleProfileUseCase.getStyleProfile(any(GetStyleProfileQuery.class)))
            .thenReturn(new GetStyleProfileUseCase.StyleProfileResult(
                Map.of("speechLevel", "haeyo"),
                Map.of("formality", "business"),
                Instant.parse("2026-06-18T03:00:00Z")
            ));

        mockMvc.perform(get("/api/v1/users/me/style-profile").with(user("user-1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.conversationTone.speechLevel").value("haeyo"))
            .andExpect(jsonPath("$.data.writingStyle.formality").value("business"))
            .andExpect(jsonPath("$.data.assistanceStyle").doesNotExist())
            .andExpect(jsonPath("$.data.detectedFromNotesAt").value("2026-06-18T03:00:00Z"))
            .andExpect(jsonPath("$.data.style").doesNotExist());

        verify(getStyleProfileUseCase).getStyleProfile(argThat(query -> query.userId().equals("user-1")));
    }

    @Test
    void putStyleProfileMatchesOpenApiContract() throws Exception {
        when(putStyleProfileUseCase.putStyleProfile(any(PutStyleProfileCommand.class)))
            .thenReturn(new PutStyleProfileUseCase.StyleProfileResult(
                Map.of("directness", "high"),
                Map.of("sentenceLength", "short"),
                null
            ));

        mockMvc.perform(put("/api/v1/users/me/style-profile")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "conversationTone": {
                        "directness": "high"
                      },
                      "writingStyle": {
                        "sentenceLength": "short"
                      }
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.conversationTone.directness").value("high"))
            .andExpect(jsonPath("$.data.writingStyle.sentenceLength").value("short"))
            .andExpect(jsonPath("$.data.assistanceStyle").doesNotExist())
            .andExpect(jsonPath("$.data.style").doesNotExist());

        verify(putStyleProfileUseCase).putStyleProfile(argThat(command ->
            command.userId().equals("user-1")
                && "high".equals(command.conversationTone().get("directness"))
                && "short".equals(command.writingStyle().get("sentenceLength"))
        ));
    }

    @Test
    void apiRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/ai/models"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.message").value("Authentication required."))
            .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void putAiModelSettingsRejectsMissingDefaultModelId() throws Exception {
        mockMvc.perform(put("/api/v1/ai/model-settings")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "userApiKeys": {}
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    void putAiModelSettingsRejectsUnknownModelId() throws Exception {
        when(putAiModelSettingsUseCase.putAiModelSettings(any(PutAiModelSettingsCommand.class)))
            .thenThrow(new UnknownAiModelException("missing-model"));

        mockMvc.perform(put("/api/v1/ai/model-settings")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "defaultModelId": "missing-model"
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"))
            .andExpect(jsonPath("$.error.message").value("Unknown AI model: missing-model"));
    }

    @Test
    void apiRejectsMalformedJson() throws Exception {
        mockMvc.perform(put("/api/v1/users/me/style-profile")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"))
            .andExpect(jsonPath("$.error.message").value("Malformed request body."));
    }
}
