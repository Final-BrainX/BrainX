package com.brainx.workspace.service;

import com.brainx.workspace.dto.request.WorkspaceRequest.*;
import com.brainx.workspace.dto.response.WorkspaceResponse.*;
import com.brainx.workspace.entity.ShareLink;
import com.brainx.workspace.exception.BrainXException;
import com.brainx.workspace.repository.NoteRepository;
import com.brainx.workspace.repository.ShareLinkRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ShareLinkService {

    private final ShareLinkRepository shareLinkRepository;
    private final NoteRepository noteRepository;

    private static final String BASE_URL = "http://localhost:3000";

    @Transactional
    public ShareLinkResponse createShareLink(String userId, CreateShareLinkRequest request) {
        noteRepository.findByNoteIdAndUserId(request.getNoteId(), userId)
                .orElseThrow(() -> BrainXException.notFound("노트를 찾을 수 없습니다"));

        ShareLink.Permission permission = "edit".equalsIgnoreCase(request.getPermission())
                ? ShareLink.Permission.EDIT : ShareLink.Permission.READ;

        ShareLink shareLink = ShareLink.builder()
                .noteId(request.getNoteId())
                .userId(userId)
                .permission(permission)
                .expiresAt(request.getExpiresAt())
                .build();
        shareLinkRepository.save(shareLink);
        return ShareLinkResponse.from(shareLink, BASE_URL);
    }

    @Transactional
    public ShareLinkResponse updateShareLink(String userId, String shareId, UpdateShareLinkRequest request) {
        ShareLink shareLink = shareLinkRepository.findByShareIdAndRevokedFalse(shareId)
                .orElseThrow(() -> BrainXException.notFound("공유 링크를 찾을 수 없습니다"));

        if (!shareLink.getUserId().equals(userId)) {
            throw BrainXException.forbidden("접근 권한이 없습니다");
        }
        if (request.getExpiresAt() != null) {
            shareLink.setExpiresAt(request.getExpiresAt());
        }
        if (Boolean.TRUE.equals(request.getRevoked())) {
            shareLink.setRevoked(true);
        }
        shareLinkRepository.save(shareLink);
        return ShareLinkResponse.from(shareLink, BASE_URL);
    }
}
