package com.brainx.intelligence.infrastructure.persistence.jpa;

import java.util.Locale;

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;

public final class JpaConstraintViolations {

    private JpaConstraintViolations() {
    }

    public static boolean causedBy(
        DataIntegrityViolationException exception,
        String expectedConstraintName
    ) {
        String expected = expectedConstraintName.toLowerCase(Locale.ROOT);
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException constraintViolation
                && containsConstraintName(constraintViolation.getConstraintName(), expected)) {
                return true;
            }
            if (containsConstraintName(cause.getMessage(), expected)) {
                return true;
            }
        }
        return false;
    }

    private static boolean containsConstraintName(String value, String expectedLowerCase) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(expectedLowerCase);
    }
}
