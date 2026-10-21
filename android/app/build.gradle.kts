plugins {
    id("com.android.application")
}

android {
    namespace = "com.eduvault.secureviewer"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.eduvault.secureviewer"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// Intentionally no dependencies beyond the Android platform. The host uses the
// system Activity, WebView and standard widgets only: no privileged keys, no
// third-party SDKs, and no duplicate application/backend code.
