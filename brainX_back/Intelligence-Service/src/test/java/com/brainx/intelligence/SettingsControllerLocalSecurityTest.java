package com.brainx.intelligence;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.brainx.intelligence.infrastructure.security.SecurityConfig;
import com.brainx.intelligence.infrastructure.web.GlobalApiExceptionHandler;
import com.brainx.intelligence.settings.adapter.web.SettingsController;
import com.brainx.intelligence.settings.application.port.inbound.GetStyleProfileUseCase;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase.AiModelsResult;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase.AiPricingPolicyView;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase.ListAiModelsQuery;
import com.brainx.intelligence.settings.application.port.inbound.PutAiModelSettingsUseCase;
import com.brainx.intelligence.settings.application.port.inbound.PutStyleProfileUseCase;

@WebMvcTest(SettingsController.class)
@Import({SecurityConfig.class, GlobalApiExceptionHandler.class})
@ActiveProfiles("local")
class SettingsControllerLocalSecurityTest {

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
    void localProfilePermitsApiWithoutAuthentication() throws Exception {
        when(listAiModelsUseCase.listAiModels(any(ListAiModelsQuery.class)))
            .thenReturn(new AiModelsResult(
                List.of(),
                List.of(),
                new AiPricingPolicyView("TOKEN", "", Map.of())
            ));

        mockMvc.perform(get("/api/v1/ai/models"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));

        verify(listAiModelsUseCase).listAiModels(argThat(query -> query.userId().equals("anonymousUser")));
    }
}
