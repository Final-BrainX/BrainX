package com.brainx.admin.repository;

import com.brainx.admin.entity.AdminDesktopDownloadEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AdminDesktopDownloadEventRepository extends JpaRepository<AdminDesktopDownloadEvent, String> {
    List<AdminDesktopDownloadEvent> findAllByOrderByDownloadedAtDesc();
}
