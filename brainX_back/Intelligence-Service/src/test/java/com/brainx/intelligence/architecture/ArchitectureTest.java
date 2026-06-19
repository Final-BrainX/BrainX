package com.brainx.intelligence.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

@AnalyzeClasses(packages = "com.brainx.intelligence")
class ArchitectureTest {

    @ArchTest
    static final ArchRule domainDoesNotDependOnFrameworks = noClasses()
        .that().resideInAPackage("..domain..")
        .should().dependOnClassesThat().resideInAnyPackage(
            "org.springframework..",
            "jakarta.persistence..",
            "org.hibernate..",
            "jakarta.servlet.."
        );

    @ArchTest
    static final ArchRule applicationDoesNotDependOnAdaptersOrInfrastructure = noClasses()
        .that().resideInAPackage("..application..")
        .should().dependOnClassesThat().resideInAnyPackage(
            "..adapter..",
            "..infrastructure.."
        );

    @ArchTest
    static final ArchRule jpaEntitiesStayInPersistenceJpaPackage = classes()
        .that().haveSimpleNameEndingWith("JpaEntity")
        .or().haveSimpleNameEndingWith("JpaRepository")
        .should().resideInAPackage("..infrastructure.persistence.jpa..");

    @ArchTest
    static void springBootMockBeanAnnotationsAreNotUsed(JavaClasses classes) {
        noClasses()
            .should().dependOnClassesThat().haveFullyQualifiedName(
                "org.springframework.boot.test.mock.mockito.MockBean"
            )
            .orShould().dependOnClassesThat().haveFullyQualifiedName(
                "org.springframework.boot.test.mock.mockito.SpyBean"
            )
            .check(classes);
    }
}
