package com.brainx.workspace.service;

import com.brainx.workspace.dto.request.WorkspaceRequest.*;
import com.brainx.workspace.dto.response.WorkspaceResponse.*;
import com.brainx.workspace.entity.*;
import com.brainx.workspace.exception.BrainXException;
import com.brainx.workspace.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class FolderService {

    private final FolderRepository folderRepository;
    private final NoteRepository noteRepository;

    @Transactional
    public FolderResponse createFolder(String userId, CreateFolderRequest request) {
        Folder parent = null;
        if (request.getParentFolderId() != null) {
            parent = folderRepository.findByFolderIdAndUserId(request.getParentFolderId(), userId)
                    .orElseThrow(() -> BrainXException.notFound("부모 폴더를 찾을 수 없습니다"));
        }
        Folder folder = Folder.builder()
                .userId(userId)
                .name(request.getName())
                .parentFolder(parent)
                .build();
        folderRepository.save(folder);
        return FolderResponse.from(folder);
    }

    @Transactional
    public FolderResponse updateFolder(String userId, String folderId, UpdateFolderRequest request) {
        Folder folder = folderRepository.findByFolderIdAndUserId(folderId, userId)
                .orElseThrow(() -> BrainXException.notFound("폴더를 찾을 수 없습니다"));
        if (request.getName() != null) {
            folder.setName(request.getName());
        }
        if (request.getParentFolderId() != null) {
            Folder parent = folderRepository.findByFolderIdAndUserId(request.getParentFolderId(), userId)
                    .orElseThrow(() -> BrainXException.notFound("부모 폴더를 찾을 수 없습니다"));
            folder.setParentFolder(parent);
        }
        folderRepository.save(folder);
        return FolderResponse.from(folder);
    }

    @Transactional
    public OkResponse deleteFolder(String userId, String folderId, DeleteFolderRequest request) {
        Folder folder = folderRepository.findByFolderIdAndUserId(folderId, userId)
                .orElseThrow(() -> BrainXException.notFound("폴더를 찾을 수 없습니다"));

        List<Note> notes = noteRepository.findByUserIdAndStatus(userId, Note.NoteStatus.ACTIVE)
                .stream().filter(n -> n.getFolder() != null && n.getFolder().getFolderId().equals(folderId))
                .toList();

        if ("trash".equals(request.getChildNoteAction())) {
            for (Note n : notes) {
                n.setStatus(Note.NoteStatus.TRASHED);
                n.setTrashedAt(LocalDateTime.now());
                n.setFolder(null);
            }
            noteRepository.saveAll(notes);
        } else if ("move".equals(request.getChildNoteAction()) && request.getTargetFolderId() != null) {
            Folder target = folderRepository.findByFolderIdAndUserId(request.getTargetFolderId(), userId)
                    .orElseThrow(() -> BrainXException.notFound("이동할 폴더를 찾을 수 없습니다"));
            for (Note n : notes) {
                n.setFolder(target);
            }
            noteRepository.saveAll(notes);
        }

        folderRepository.delete(folder);
        return OkResponse.builder().ok(true).build();
    }

    @Transactional(readOnly = true)
    public List<FolderResponse> getFolders(String userId) {
        return folderRepository.findByUserId(userId).stream()
                .map(FolderResponse::from)
                .toList();
    }
}
