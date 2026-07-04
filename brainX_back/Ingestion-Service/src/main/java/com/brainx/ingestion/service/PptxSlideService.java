package com.brainx.ingestion.service;

import lombok.extern.slf4j.Slf4j;
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

@Slf4j
@Service
public class PptxSlideService {

    private static final int RENDER_WIDTH = 1280;

    public int getSlideCount(byte[] pptxBytes) throws IOException {
        try (XMLSlideShow pptx = new XMLSlideShow(new ByteArrayInputStream(pptxBytes))) {
            return pptx.getSlides().size();
        }
    }

    /** 0-based slideIndex 슬라이드를 PNG로 렌더링해 반환한다. */
    public byte[] renderSlide(byte[] pptxBytes, int slideIndex) throws IOException {
        try (XMLSlideShow pptx = new XMLSlideShow(new ByteArrayInputStream(pptxBytes))) {
            java.util.List<XSLFSlide> slides = pptx.getSlides();
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
}
