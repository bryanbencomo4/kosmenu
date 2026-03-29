import com.android.build.gradle.LibraryExtension
import org.gradle.api.Project
import org.gradle.api.JavaVersion
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

fun Project.resolveAndroidNamespace(): String {
    val manifestFile = file("src/main/AndroidManifest.xml")
    if (manifestFile.exists()) {
        val manifestText = manifestFile.readText()
        val packageMatch = Regex("""package=\"([^\"]+)\"""").find(manifestText)
        val packageName = packageMatch?.groupValues?.getOrNull(1)?.trim()
        if (!packageName.isNullOrEmpty()) {
            return packageName
        }
    }

    return "com.kosmenu.${name.replace('-', '_')}"
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")

    plugins.withId("com.android.library") {
        extensions.configure<LibraryExtension> {
            namespace = project.resolveAndroidNamespace()
        }

        tasks.withType<KotlinCompile>().configureEach {
            val libraryExtension = project.extensions.getByType(LibraryExtension::class.java)
            val javaTarget = libraryExtension.compileOptions.targetCompatibility.toString()
            compilerOptions {
                jvmTarget.set(JvmTarget.fromTarget(javaTarget))
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
