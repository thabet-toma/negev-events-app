import java.io.FileInputStream
import java.util.Properties

// مفتاح توقيع الإصدار. الملف خارج المستودع ومتجاهَل في .gitignore — كلمة السر
// لا تُلتزم أبداً. غيابه يُسقط البناء إلى مفتاح الـdebug بدل أن يفشل، كي يظل
// `flutter run --release` يعمل على جهاز لا يملك المفتاح.
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        FileInputStream(keystorePropertiesFile).use { load(it) }
    }
}

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.negev.negev_events"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // flutter_local_notifications (منبّه التذكير المحلي، issue #85 دفعة ٧)
        // يفرض هذا على التطبيق المستهلِك نفسه لا على الحزمة وحدها — بلاه يسقط
        // `flutter build apk` عند :app:checkReleaseAarMetadata برسالة «requires
        // core library desugaring to be enabled for :app». ولا اختبار يمسك
        // هذا: `flutter test` لا يبني أندرويد إطلاقاً، فالبناء وحده يكشفه.
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.negev.negev_events"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            storeFile = keystoreProperties.getProperty("storeFile")?.let { file(it) }
            storePassword = keystoreProperties.getProperty("storePassword")
            keyAlias = keystoreProperties.getProperty("keyAlias")
            keyPassword = keystoreProperties.getProperty("keyPassword")
        }
    }

    buildTypes {
        release {
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

dependencies {
    // النسخة مثبَّتة على ما تطلبه الحزمة نفسها في
    // flutter_local_notifications-22.3.0/android/build.gradle — نسخة أقدم
    // منها تُسقط البناء، ورفعها بلا سبب يخاطر بتعارض لا يظهر إلا في release.
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

flutter {
    source = "../.."
}
