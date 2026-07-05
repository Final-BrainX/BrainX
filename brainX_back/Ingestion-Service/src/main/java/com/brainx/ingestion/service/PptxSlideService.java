package com.brainx.ingestion.service;

import lombok.extern.slf4j.Slf4j;
import org.apache.poi.openxml4j.opc.PackagePart;
import org.apache.poi.openxml4j.opc.PackageRelationship;
import org.apache.poi.openxml4j.opc.PackagingURIHelper;
import org.apache.poi.openxml4j.opc.TargetMode;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.*;
import java.util.List;

@Slf4j
@Service
public class PptxSlideService {

    private static final int RENDER_WIDTH = 1280;
    private static final Set<String> VIDEO_EXTENSIONS = Set.of("mp4", "mov", "wmv", "avi", "webm", "mkv", "m4v");

    public int getSlideCount(byte[] pptxBytes) throws IOException {
        try (XMLSlideShow pptx = new XMLSlideShow(new ByteArrayInputStream(pptxBytes))) {
            return pptx.getSlides().size();
        }
    }

    /** 0-based slideIndex 슬라이드를 PNG로 렌더링해 반환한다. */
    public byte[] renderSlide(byte[] pptxBytes, int slideIndex) throws IOException {
        try (XMLSlideShow pptx = new XMLSlideShow(new ByteArrayInputStream(pptxBytes))) {
            List<XSLFSlide> slides = pptx.getSlides();
            if (slideIndex < 0 || slideIndex >= slides.size()) {
                throw new IllegalArgumentException("슬라이드 인덱스가 범위를 벗어났습니다: " + slideIndex);
            }
            Dimension pageSize = pptx.getPageSize();
            double scale = (double) RENDER_WIDTH / pageSize.width;
            int height = (int) Math.round(pageSize.height * scale);

            BufferedImage img = new BufferedImage(RENDER_WIDTH, height, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = img.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, RENDER_WIDTH, height);
            g.scale(scale, scale);
            slides.get(slideIndex).draw(g);
            g.dispose();

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, "PNG", out);
            return out.toByteArray();
        }
    }

    /**
     * 영상이 포함된 슬라이드의 0-based 인덱스 → MIME 타입 맵을 반환한다.
     * 영상 없는 슬라이드는 맵에 포함되지 않는다.
     */
    public Map<Integer, String> getVideoSlideMap(byte[] pptxBytes) throws IOException {
        Map<Integer, String> result = new LinkedHashMap<>();
        try (XMLSlideShow pptx = new XMLSlideShow(new ByteArrayInputStream(pptxBytes))) {
            List<XSLFSlide> slides = pptx.getSlides();
            for (int i = 0; i < slides.size(); i++) {
                PackagePart slidePart = slides.get(i).getPackagePart();
                PackageRelationship videoRel = findVideoRelationship(slidePart);
                if (videoRel == null) continue;
                try {
                    String targetPath = videoRel.getTargetURI().toString();
                    result.put(i, videoContentTypeFor(targetPath));
                } catch (Exception e) {
                    log.warn("영상 슬라이드 메타 추출 실패: slideIndex={}", i, e);
                }
            }
        }
        return result;
    }

    /**
     * 특정 슬라이드에 포함된 영상 바이트를 반환한다. 영상이 없으면 null.
     */
    public byte[] extractSlideVideo(byte[] pptxBytes, int slideIndex) throws IOException {
        try (XMLSlideShow pptx = new XMLSlideShow(new ByteArrayInputStream(pptxBytes))) {
            List<XSLFSlide> slides = pptx.getSlides();
            if (slideIndex < 0 || slideIndex >= slides.size()) return null;
            PackagePart slidePart = slides.get(slideIndex).getPackagePart();
            PackageRelationship videoRel = findVideoRelationship(slidePart);
            if (videoRel == null) return null;
            try {
                PackagePart videoPart = slidePart.getPackage().getPart(
                        PackagingURIHelper.createPartName(
                                PackagingURIHelper.resolvePartUri(
                                        slidePart.getPartName().getURI(), videoRel.getTargetURI())));
                if (videoPart == null) return null;
                try (InputStream in = videoPart.getInputStream()) {
                    return in.readAllBytes();
                }
            } catch (Exception e) {
                log.warn("영상 추출 실패: slideIndex={}", slideIndex, e);
                return null;
            }
        }
    }

    /**
     * 특정 슬라이드의 영상 MIME 타입을 반환한다. 영상이 없으면 null.
     */
    public String getSlideVideoContentType(byte[] pptxBytes, int slideIndex) throws IOException {
        try (XMLSlideShow pptx = new XMLSlideShow(new ByteArrayInputStream(pptxBytes))) {
            List<XSLFSlide> slides = pptx.getSlides();
            if (slideIndex < 0 || slideIndex >= slides.size()) return null;
            PackagePart slidePart = slides.get(slideIndex).getPackagePart();
            PackageRelationship videoRel = findVideoRelationship(slidePart);
            if (videoRel == null) return null;
            return videoContentTypeFor(videoRel.getTargetURI().toString());
        }
    }

    private PackageRelationship findVideoRelationship(PackagePart slidePart) {
        try {
            for (PackageRelationship rel : slidePart.getRelationships()) {
                if (rel.getTargetMode() != TargetMode.INTERNAL) continue;
                String relType = rel.getRelationshipType();
                String target = rel.getTargetURI().toString().toLowerCase();
                boolean isVideoRel = relType.contains("/video");
                boolean isMediaRel = relType.contains("/media") && hasVideoExtension(target);
                if (isVideoRel || isMediaRel) return rel;
            }
        } catch (Exception e) {
            log.debug("슬라이드 관계 읽기 실패", e);
        }
        return null;
    }

    private boolean hasVideoExtension(String path) {
        int dot = path.lastIndexOf('.');
        return dot >= 0 && VIDEO_EXTENSIONS.contains(path.substring(dot + 1));
    }

    private String videoContentTypeFor(String path) {
        int dot = path.lastIndexOf('.');
        if (dot < 0) return "video/mp4";
        return switch (path.substring(dot + 1).toLowerCase()) {
            case "mp4"  -> "video/mp4";
            case "mov"  -> "video/quicktime";
            case "wmv"  -> "video/x-ms-wmv";
            case "avi"  -> "video/x-msvideo";
            case "webm" -> "video/webm";
            case "mkv"  -> "video/x-matroska";
            case "m4v"  -> "video/x-m4v";
            default     -> "video/mp4";
        };
    }
}
