plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 버전은 repo 루트의 android-version.properties 한 곳에서만 관리 (3개 앱 공통)
val sharedVersion = java.util.Properties().apply {
    file("${rootDir}/../android-version.properties").inputStream().use { load(it) }
}
val appVersionName: String = sharedVersion.getProperty("VERSION_NAME")
val appVersionCode: Int = appVersionName.split(".").map { it.toInt() }.let { it[0] * 10000 + it[1] * 100 + it[2] }

android {
    namespace = "cloud.sheetbot.agent.manager"
    compileSdk = 34

    defaultConfig {
        applicationId = "cloud.sheetbot.agent.manager"
        minSdk = 24
        targetSdk = 34
        versionCode = appVersionCode
        versionName = appVersionName
    }

    // 다른 SheetBot 에이전트와 동일한 서명 키를 재사용 (키 파일 중복 복사 방지)
    signingConfigs {
        create("release") {
            storeFile = file("${rootDir}/../android-user-agent/keystore/sheetbot-agent.jks")
            storePassword = "sheetbot_agent_key_2026"
            keyAlias = "sheetbot_agent"
            keyPassword = "sheetbot_agent_key_2026"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            signingConfig = signingConfigs.getByName("release")
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
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // QR 코드 스캐너
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    implementation("com.google.zxing:core:3.5.3")
}
