import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Read local.properties for API secrets
val localProps = Properties()
val localPropsFile = rootProject.file("local.properties")
if (localPropsFile.exists()) {
    localProps.load(localPropsFile.inputStream())
}

android {
    namespace = "com.mustard.relay"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mustard.relay"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        // Expose API config from local.properties as BuildConfig fields
        buildConfigField("String", "API_ENDPOINT", "\"${localProps.getProperty("relay.api.endpoint", "")}\"")
        buildConfigField("String", "API_KEY", "\"${localProps.getProperty("relay.api.key", "")}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
