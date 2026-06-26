package brain.web.mvc.controller;

import brain.web.mvc.entity.SupportInquiry;
import brain.web.mvc.repository.SupportInquiryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/internal/v1/support/tickets")
@RequiredArgsConstructor
public class InternalSupportController {

    private final SupportInquiryRepository supportInquiryRepository;

    @GetMapping
    public ResponseEntity<List<TicketDto>> listTickets(@RequestParam(required = false) SupportInquiry.InquiryStatus status) {
        List<SupportInquiry> tickets;
        if (status != null) {
            tickets = supportInquiryRepository.findByStatusOrderByCreatedAtDesc(status);
        } else {
            tickets = supportInquiryRepository.findAllByOrderByCreatedAtDesc();
        }
        List<TicketDto> dtos = tickets.stream()
                .map(TicketDto::from)
                .toList();
        return ResponseEntity.ok(dtos);
    }

    @GetMapping("/{ticketId}")
    public ResponseEntity<TicketDto> getTicket(@PathVariable String ticketId) {
        SupportInquiry ticket = supportInquiryRepository.findById(ticketId)
                .or(() -> supportInquiryRepository.findWithUserByInquiryId(ticketId))
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found: " + ticketId));
        return ResponseEntity.ok(TicketDto.from(ticket));
    }

    @PatchMapping("/{ticketId}")
    @Transactional
    public ResponseEntity<TicketDto> updateTicket(
            @PathVariable String ticketId,
            @RequestBody Map<String, Object> body
    ) {
        SupportInquiry ticket = supportInquiryRepository.findById(ticketId)
                .or(() -> supportInquiryRepository.findWithUserByInquiryId(ticketId))
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found: " + ticketId));

        if (body.containsKey("status") && body.get("status") != null) {
            ticket.updateStatus(SupportInquiry.InquiryStatus.valueOf((String) body.get("status")));
        }

        if (body.containsKey("assigneeAdminUserId")) {
            String adminId = (String) body.get("assigneeAdminUserId");
            if (adminId != null) {
                ticket.assignAdmin(adminId, "김운영");
            }
        }

        return ResponseEntity.ok(TicketDto.from(ticket));
    }

    @PostMapping("/{ticketId}/replies")
    @Transactional
    public ResponseEntity<Map<String, String>> replyTicket(
            @PathVariable String ticketId,
            @RequestBody Map<String, String> body
    ) {
        SupportInquiry ticket = supportInquiryRepository.findById(ticketId)
                .or(() -> supportInquiryRepository.findWithUserByInquiryId(ticketId))
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found: " + ticketId));

        String replyContent = body.get("body");
        ticket.reply(replyContent, "adm_001", "김운영");

        return ResponseEntity.ok(Map.of("replyId", "RPL-" + System.currentTimeMillis()));
    }

    @DeleteMapping("/{ticketId}")
    @Transactional
    public ResponseEntity<Void> deleteTicket(@PathVariable String ticketId) {
        SupportInquiry ticket = supportInquiryRepository.findById(ticketId)
                .or(() -> supportInquiryRepository.findWithUserByInquiryId(ticketId))
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found: " + ticketId));
        supportInquiryRepository.delete(ticket);
        return ResponseEntity.noContent().build();
    }

    public record TicketDto(
            String ticketId,
            String userId,
            String userName,
            String email,
            SupportInquiry.InquiryStatus status,
            String category,
            String subject,
            LocalDateTime createdAt,
            String assigneeAdminUserId,
            String assigneeAdminName,
            boolean urgent,
            String body,
            String replyContent,
            LocalDateTime repliedAt
    ) {
        public static TicketDto from(SupportInquiry inquiry) {
            return new TicketDto(
                    inquiry.getInquiryId(),
                    inquiry.getUser().getUserId(),
                    inquiry.getUser().getNickname(),
                    inquiry.getUser().getEmail(),
                    inquiry.getStatus(),
                    inquiry.getCategory(),
                    inquiry.getTitle(),
                    inquiry.getCreatedAt(),
                    inquiry.getAssigneeAdminUserId(),
                    inquiry.getAssigneeAdminName(),
                    inquiry.isUrgent(),
                    inquiry.getContent(),
                    inquiry.getReplyContent(),
                    inquiry.getRepliedAt()
            );
        }
    }
}
