package com.brainx.intelligence;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.brainx.intelligence.infrastructure.security.SecurityConfig;
import com.brainx.intelligence.infrastructure.web.GlobalApiExceptionHandler;
import com.brainx.intelligence.settings.adapter.web.SettingsController;
import com.brainx.intelligence.settings.application.port.inbound.GetStyleProfileUseCase;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase;
import com.brainx.intelligence.settings.application.port.inbound.PutAiModelSettingsUseCase;
import com.brainx.intelligence.settings.application.port.inbound.PutStyleProfileUseCase;

@WebMvcTest(SettingsController.class)
@Import({SecurityConfig.class, GlobalApiExceptionHandler.class})
class SettingsControllerDefaultSecurityTest {

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
    void defaultProfileRequiresAuthenticationForApi() throws Exception {
        mockMvc.perform(get("/api/v1/ai/models"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.message").value("Authentication required."));

        verifyNoInteractions(listAiModelsUseCase);
    }
}
