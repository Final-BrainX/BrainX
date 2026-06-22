package com.brainx.workspace.config;

import com.brainx.workspace.dto.WorkspaceDtos.FolderCreateRequest;
import com.brainx.workspace.dto.WorkspaceDtos.FolderData;
import com.brainx.workspace.dto.WorkspaceDtos.NoteCreateRequest;
import com.brainx.workspace.repository.NoteRepository;
import com.brainx.workspace.service.WorkspaceService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
@RequiredArgsConstructor
public class WorkspaceDemoDataSeeder {
    private static final String DEMO_USER_ID = "dev-test-user";

    private final WorkspaceService workspaceService;
    private final NoteRepository noteRepository;

    @Value("${brainx.seed-demo-data:true}")
    private boolean seedDemoData;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void seed() {
        if (!seedDemoData || !noteRepository.findByUserIdAndDeletedFalseOrderByUpdatedAtDesc(DEMO_USER_ID).isEmpty()) {
            return;
        }

        FolderData backend = workspaceService.createFolder(DEMO_USER_ID, new FolderCreateRequest("Backend", null));
        FolderData ai = workspaceService.createFolder(DEMO_USER_ID, new FolderCreateRequest("AI", null));

        workspaceService.createNote(DEMO_USER_ID, new NoteCreateRequest(
                "Spring Security JWT 정리",
                """
                <h1>Spring Security JWT 정리</h1>
                <p>Access Token은 짧게, Refresh Token은 안전한 저장소에 보관한다.</p>
                <ul><li>인증 필터</li><li>토큰 재발급</li><li>권한별 API 보호</li></ul>
                """,
                backend.folderId(),
                List.of("backend", "spring", "jwt")
        ));
        workspaceService.createNote(DEMO_USER_ID, new NoteCreateRequest(
                "MSA 서비스 경계 메모",
                """
                <h1>MSA 서비스 경계 메모</h1>
                <p>User, Workspace, Ingestion, Commerce는 각자 DB를 직접 소유한다.</p>
                <p>서비스 간 상태 변경은 public/internal API와 이벤트로 전달한다.</p>
                """,
                backend.folderId(),
                List.of("backend", "msa", "architecture")
        ));
        workspaceService.createNote(DEMO_USER_ID, new NoteCreateRequest(
                "RAG 파이프라인 아이디어",
                """
                <h1>RAG 파이프라인 아이디어</h1>
                <p>노트 청킹, 임베딩, 검색, 재순위화, 답변 생성 단계를 분리해서 관찰 가능하게 만든다.</p>
                """,
                ai.folderId(),
                List.of("ai", "rag", "llm")
        ));
    }
}
