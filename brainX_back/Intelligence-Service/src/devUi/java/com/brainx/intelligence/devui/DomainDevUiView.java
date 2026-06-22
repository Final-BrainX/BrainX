package com.brainx.intelligence.devui;

import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Profile;

import com.brainx.intelligence.settings.application.port.inbound.GetStyleProfileUseCase;
import com.brainx.intelligence.settings.application.port.inbound.GetStyleProfileUseCase.GetStyleProfileQuery;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase.AiModelView;
import com.brainx.intelligence.settings.application.port.inbound.ListAiModelsUseCase.ListAiModelsQuery;
import com.brainx.intelligence.settings.application.port.inbound.PutAiModelSettingsUseCase;
import com.brainx.intelligence.settings.application.port.inbound.PutAiModelSettingsUseCase.PutAiModelSettingsCommand;
import com.brainx.intelligence.settings.application.port.inbound.PutStyleProfileUseCase;
import com.brainx.intelligence.settings.application.port.inbound.PutStyleProfileUseCase.PutStyleProfileCommand;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vaadin.flow.component.Text;
import com.vaadin.flow.component.UI;
import com.vaadin.flow.component.applayout.AppLayout;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.combobox.ComboBox;
import com.vaadin.flow.component.grid.Grid;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.H2;
import com.vaadin.flow.component.html.H3;
import com.vaadin.flow.component.html.Main;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.notification.Notification;
import com.vaadin.flow.component.orderedlayout.FlexComponent.Alignment;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.splitlayout.SplitLayout;
import com.vaadin.flow.component.tabs.Tab;
import com.vaadin.flow.component.tabs.Tabs;
import com.vaadin.flow.component.textfield.TextArea;
import com.vaadin.flow.component.textfield.TextField;
import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;

@Route("dev-ui")
@PageTitle("BrainX Intelligence Dev UI")
@Profile("dev-ui")
public class DomainDevUiView extends AppLayout {

    private static final String DEFAULT_USER_ID = "dev-user";
    private static final String EMPTY_JSON = "{}";

    private final ListAiModelsUseCase listAiModelsUseCase;
    private final PutAiModelSettingsUseCase putAiModelSettingsUseCase;
    private final GetStyleProfileUseCase getStyleProfileUseCase;
    private final PutStyleProfileUseCase putStyleProfileUseCase;
    private final DevFixtureService fixtureService;
    private final ObjectMapper objectMapper;
    private final TextField userIdField = new TextField("userId");
    private final VerticalLayout content = new VerticalLayout();
    private final TextArea requestInspector = new TextArea("Request / intent");
    private final TextArea resultInspector = new TextArea("Result / fixture");
    private final Grid<AiModelView> modelsGrid = new Grid<>(AiModelView.class, false);
    private final ComboBox<String> defaultModelId = new ComboBox<>("Default model");
    private final TextArea userApiKeys = new TextArea("User API keys JSON");
    private final TextArea conversationTone = new TextArea("Conversation tone JSON");
    private final TextArea writingStyle = new TextArea("Writing style JSON");
    private final TextArea assistanceStyle = new TextArea("Assistance style JSON");

    private final List<DomainDefinition> domains = List.of(
        new DomainDefinition("settings", "AI 사용 준비", "AI 모델, 기본 모델, 문체 프로필", "live", "settings"),
        new DomainDefinition("exploration", "지식 탐색", "시맨틱 검색과 노트 요약", "fixture", "exploration"),
        new DomainDefinition("assist", "노트 작성 보조", "인라인 어시스트와 AI 제안 결정", "fixture", "assist"),
        new DomainDefinition("chat", "RAG 채팅", "채팅 스레드, 메시지, 스트리밍 답변", "fixture", "chat"),
        new DomainDefinition("connection", "노트 연결 추천", "관련 노트 링크와 징검다리 개념", "fixture", "connection"),
        new DomainDefinition("organization", "지식 정리 제안", "폴더 구조와 노트 이동 제안", "fixture", "organization"),
        new DomainDefinition("clustering", "지식 구조 분석", "클러스터링 작업과 결과", "fixture", "clustering"),
        new DomainDefinition("insight", "고급 인사이트", "인사이트 리포트와 지식 공백", "fixture", "insight")
    );

    public DomainDevUiView(
        ListAiModelsUseCase listAiModelsUseCase,
        PutAiModelSettingsUseCase putAiModelSettingsUseCase,
        GetStyleProfileUseCase getStyleProfileUseCase,
        PutStyleProfileUseCase putStyleProfileUseCase,
        DevFixtureService fixtureService,
        ObjectMapper objectMapper
    ) {
        this.listAiModelsUseCase = listAiModelsUseCase;
        this.putAiModelSettingsUseCase = putAiModelSettingsUseCase;
        this.getStyleProfileUseCase = getStyleProfileUseCase;
        this.putStyleProfileUseCase = putStyleProfileUseCase;
        this.fixtureService = fixtureService;
        this.objectMapper = objectMapper;

        configureShell();
        configureInspectors();
        configureSettingsControls();
        showDomain(domains.getFirst());
    }

    private void configureShell() {
        var title = new H2("BrainX Intelligence Dev UI");
        title.getStyle().set("margin", "0").set("font-size", "18px");

        userIdField.setValue(DEFAULT_USER_ID);
        userIdField.setWidthFull();

        Tabs navigation = new Tabs();
        navigation.setOrientation(Tabs.Orientation.VERTICAL);
        navigation.setWidthFull();
        for (DomainDefinition domain : domains) {
            Tab tab = new Tab(domain.label());
            tab.setId(domain.id());
            navigation.add(tab);
        }
        navigation.addSelectedChangeListener(event -> {
            String selectedId = event.getSelectedTab().getId().orElse("settings");
            domains.stream()
                .filter(domain -> domain.id().equals(selectedId))
                .findFirst()
                .ifPresent(this::showDomain);
        });

        var drawer = new VerticalLayout(title, userIdField, navigation);
        drawer.setPadding(true);
        drawer.setSpacing(true);
        drawer.setWidth("280px");
        drawer.getStyle()
            .set("border-right", "1px solid var(--lumo-contrast-10pct)")
            .set("background", "var(--lumo-base-color)");
        addToDrawer(drawer);

        content.setPadding(true);
        content.setSpacing(true);
        content.setSizeFull();

        var inspector = new VerticalLayout(requestInspector, resultInspector);
        inspector.setPadding(true);
        inspector.setSpacing(true);
        inspector.setWidth("38%");
        inspector.setMinWidth("360px");

        SplitLayout splitLayout = new SplitLayout(new Main(content), inspector);
        splitLayout.setSizeFull();
        splitLayout.setSplitterPosition(62);
        setContent(splitLayout);
        setDrawerOpened(true);
    }

    private void configureInspectors() {
        requestInspector.setWidthFull();
        requestInspector.setHeight("220px");
        requestInspector.setReadOnly(true);

        resultInspector.setWidthFull();
        resultInspector.setHeight("calc(100vh - 280px)");
        resultInspector.setReadOnly(true);
    }

    private void configureSettingsControls() {
        modelsGrid.addColumn(AiModelView::modelId).setHeader("Model ID").setAutoWidth(true);
        modelsGrid.addColumn(AiModelView::name).setHeader("Name").setAutoWidth(true);
        modelsGrid.addColumn(AiModelView::provider).setHeader("Provider").setAutoWidth(true);
        modelsGrid.addColumn(AiModelView::enabled).setHeader("Enabled").setAutoWidth(true);
        modelsGrid.addColumn(AiModelView::vendorInputCostPer1kTokens).setHeader("Input / 1k").setAutoWidth(true);
        modelsGrid.addColumn(AiModelView::vendorCachedInputCostPer1kTokens).setHeader("Cached / 1k").setAutoWidth(true);
        modelsGrid.addColumn(AiModelView::vendorOutputCostPer1kTokens).setHeader("Output / 1k").setAutoWidth(true);
        modelsGrid.addColumn(AiModelView::costCurrency).setHeader("Currency").setAutoWidth(true);
        modelsGrid.setHeight("260px");

        userApiKeys.setValue("{\n  \"openai\": {\n    \"masked\": true\n  }\n}");
        userApiKeys.setWidthFull();
        userApiKeys.setMinHeight("120px");

        conversationTone.setValue("{\n  \"speechLevel\": \"haeyo\",\n  \"directness\": \"high\"\n}");
        writingStyle.setValue("{\n  \"formality\": \"business\",\n  \"sentenceLength\": \"short\"\n}");
        assistanceStyle.setValue("{\n  \"clarificationPolicy\": \"only_when_blocking\"\n}");
        List.of(conversationTone, writingStyle, assistanceStyle).forEach(area -> {
            area.setWidthFull();
            area.setMinHeight("120px");
        });
    }

    private void showDomain(DomainDefinition domain) {
        content.removeAll();

        var header = new HorizontalLayout();
        header.setAlignItems(Alignment.CENTER);
        header.setWidthFull();
        var titleBlock = new VerticalLayout(new H2(domain.label()), new Span(domain.description()));
        titleBlock.setPadding(false);
        titleBlock.setSpacing(false);
        titleBlock.setWidthFull();
        header.add(titleBlock, statusBadge(domain.status()));

        content.add(header);
        if ("settings".equals(domain.id())) {
            content.add(settingsPanel());
            loadModels();
            loadStyleProfile();
            return;
        }

        content.add(fixturePanel(domain));
        inspect(
            "fixture preview: " + domain.id(),
            fixtureService.loadFixture(domain.fixtureName())
        );
    }

    private VerticalLayout settingsPanel() {
        var modelActions = new HorizontalLayout(
            new Button("Load models", event -> loadModels()),
            new Button("Save model setting", event -> saveModelSetting())
        );
        modelActions.setAlignItems(Alignment.END);

        var modelPanel = section(
            "AI models",
            new Span("Catalog and enabled model state from the settings usecase."),
            modelsGrid,
            defaultModelId,
            userApiKeys,
            modelActions
        );

        var styleActions = new HorizontalLayout(
            new Button("Load style profile", event -> loadStyleProfile()),
            new Button("Save style profile", event -> saveStyleProfile())
        );
        styleActions.setAlignItems(Alignment.END);

        var stylePanel = section(
            "Style profile",
            new Span("Separated conversation, writing, and assistance preferences."),
            conversationTone,
            writingStyle,
            assistanceStyle,
            styleActions
        );

        var layout = new VerticalLayout(modelPanel, stylePanel);
        layout.setPadding(false);
        layout.setSpacing(true);
        layout.setWidthFull();
        return layout;
    }

    private VerticalLayout fixturePanel(DomainDefinition domain) {
        var mode = new ComboBox<String>("Mode");
        mode.setItems("fixture", "live later");
        mode.setValue("fixture");
        mode.setWidth("180px");

        var payload = new TextArea("Draft request / UX note");
        payload.setValue(fixtureService.loadFixture(domain.fixtureName()));
        payload.setWidthFull();
        payload.setHeight("340px");

        var loadFixture = new Button("Reload fixture", event -> {
            payload.setValue(fixtureService.loadFixture(domain.fixtureName()));
            inspect("fixture preview: " + domain.id(), payload.getValue());
        });
        var previewStream = new Button("Preview delta stream", event -> previewDeltaStream(domain));

        var actions = new HorizontalLayout(mode, loadFixture, previewStream);
        actions.setAlignItems(Alignment.END);

        return section(
            domain.label() + " preview",
            new Span("Public API is not implemented here yet; this pane keeps the domain UX visible without changing contracts."),
            actions,
            payload
        );
    }

    private void loadModels() {
        runAction("GET /api/v1/ai/models", () -> {
            var result = listAiModelsUseCase.listAiModels(new ListAiModelsQuery(userId()));
            modelsGrid.setItems(result.models());
            defaultModelId.setItems(result.models().stream().map(AiModelView::modelId).toList());
            result.models().stream().findFirst().map(AiModelView::modelId).ifPresent(defaultModelId::setValue);
            inspect(
                "ListAiModelsQuery(userId=" + userId() + ")",
                pretty(result)
            );
        });
    }

    private void saveModelSetting() {
        runAction("PUT /api/v1/ai/model-settings", () -> {
            if (defaultModelId.isEmpty()) {
                throw new IllegalStateException("Default model is required. Load models first.");
            }
            var result = putAiModelSettingsUseCase.putAiModelSettings(new PutAiModelSettingsCommand(
                userId(),
                defaultModelId.getValue(),
                readJsonMap(userApiKeys.getValue())
            ));
            inspect(
                "PutAiModelSettingsCommand(userId=" + userId() + ", defaultModelId=" + defaultModelId.getValue() + ")",
                pretty(result)
            );
        });
    }

    private void loadStyleProfile() {
        runAction("GET /api/v1/users/me/style-profile", () -> {
            var result = getStyleProfileUseCase.getStyleProfile(new GetStyleProfileQuery(userId()));
            conversationTone.setValue(prettyMap(result.conversationTone()));
            writingStyle.setValue(prettyMap(result.writingStyle()));
            assistanceStyle.setValue(prettyMap(result.assistanceStyle()));
            inspect(
                "GetStyleProfileQuery(userId=" + userId() + ")",
                pretty(result)
            );
        });
    }

    private void saveStyleProfile() {
        runAction("PUT /api/v1/users/me/style-profile", () -> {
            var result = putStyleProfileUseCase.putStyleProfile(new PutStyleProfileCommand(
                userId(),
                readJsonMap(conversationTone.getValue()),
                readJsonMap(writingStyle.getValue()),
                readJsonMap(assistanceStyle.getValue())
            ));
            inspect(
                "PutStyleProfileCommand(userId=" + userId() + ")",
                pretty(result)
            );
        });
    }

    private void previewDeltaStream(DomainDefinition domain) {
        var fixture = fixtureService.loadFixture(domain.fixtureName());
        resultInspector.setValue("");
        requestInspector.setValue("fixture delta stream: " + domain.id());
        UI ui = UI.getCurrent();
        var fragments = List.of("event: started\n", "event: delta\n", fixture, "\nevent: completed\n");
        ui.access(() -> resultInspector.setValue(String.join("", fragments)));
    }

    private void runAction(String request, Action action) {
        try {
            action.run();
            Notification.show("Done", 1800, Notification.Position.BOTTOM_END);
        } catch (Exception exception) {
            inspect(request, exception.getClass().getSimpleName() + ": " + exception.getMessage());
            Notification.show(exception.getMessage(), 3500, Notification.Position.MIDDLE);
        }
    }

    private void inspect(String request, String result) {
        requestInspector.setValue(request);
        resultInspector.setValue(result == null ? "" : result);
    }

    private String userId() {
        String value = userIdField.getValue();
        if (value == null || value.isBlank()) {
            return DEFAULT_USER_ID;
        }
        return value.trim();
    }

    private Map<String, Object> readJsonMap(String value) throws java.io.IOException {
        String json = value == null || value.isBlank() ? EMPTY_JSON : value;
        return objectMapper.readValue(json, new TypeReference<>() {
        });
    }

    private String prettyMap(Map<String, Object> value) {
        return value == null || value.isEmpty() ? EMPTY_JSON : pretty(value);
    }

    private String pretty(Object value) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(value);
        } catch (Exception exception) {
            return String.valueOf(value);
        }
    }

    private Span statusBadge(String status) {
        Span badge = new Span(status);
        badge.getElement().getThemeList().add("badge");
        if ("live".equals(status)) {
            badge.getElement().getThemeList().add("success");
        } else {
            badge.getElement().getThemeList().add("contrast");
        }
        return badge;
    }

    private VerticalLayout section(String heading, com.vaadin.flow.component.Component... components) {
        return section(heading, null, components);
    }

    private VerticalLayout section(String heading, Span description, com.vaadin.flow.component.Component... components) {
        var layout = new VerticalLayout();
        layout.setPadding(false);
        layout.setSpacing(true);
        layout.setWidthFull();
        layout.getStyle()
            .set("border-top", "1px solid var(--lumo-contrast-10pct)")
            .set("padding-top", "var(--lumo-space-m)");

        H3 title = new H3(heading);
        title.getStyle().set("margin", "0");
        layout.add(title);
        if (description != null) {
            layout.add(description);
        }
        for (var component : components) {
            layout.add(component);
        }
        return layout;
    }

    @FunctionalInterface
    private interface Action {
        void run() throws Exception;
    }

    private record DomainDefinition(
        String id,
        String label,
        String description,
        String status,
        String fixtureName
    ) {
    }
}
