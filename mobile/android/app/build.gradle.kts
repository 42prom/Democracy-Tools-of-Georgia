import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

val releaseKeystoreProperties = Properties()
val releaseKeystorePropertiesFile = rootProject.file("key.properties")
val releaseTaskRequested = gradle.startParameter.taskNames.any {
    it.contains("release", ignoreCase = true)
}
val playIntegrityCloudProjectNumber = providers
    .gradleProperty("PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER")
    .orElse(providers.environmentVariable("PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER"))
    .orNull
    ?.trim()
    ?.toLongOrNull()

if (releaseTaskRequested && (playIntegrityCloudProjectNumber == null || playIntegrityCloudProjectNumber <= 0L)) {
    throw GradleException(
        "PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER must be supplied with -P or an environment variable for release builds."
    )
}

if (releaseKeystorePropertiesFile.exists()) {
    FileInputStream(releaseKeystorePropertiesFile).use {
        releaseKeystoreProperties.load(it)
    }
}

android {
    namespace = "messaging.dtg"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "messaging.dtg"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        buildConfigField(
            "long",
            "PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER",
            "${playIntegrityCloudProjectNumber ?: 0L}L"
        )
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (releaseKeystorePropertiesFile.exists()) {
            create("release") {
                keyAlias = releaseKeystoreProperties.getProperty("keyAlias")
                keyPassword = releaseKeystoreProperties.getProperty("keyPassword")
                storeFile = file(releaseKeystoreProperties.getProperty("storeFile"))
                storePassword = releaseKeystoreProperties.getProperty("storePassword")
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }

    buildTypes {
        release {
            if (!releaseKeystorePropertiesFile.exists()) {
                if (releaseTaskRequested) {
                    throw GradleException(
                        "Release signing is not configured. Copy key.properties.example " +
                            "to key.properties and point it at the production keystore."
                    )
                }
            } else {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.0.3")
    implementation("com.google.android.play:integrity:1.6.0")
}

flutter {
    source = "../.."
}
