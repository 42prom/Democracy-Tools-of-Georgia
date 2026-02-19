# Proguard rules for ML Kit Text Recognition
# These classes are referenced by google_mlkit_text_recognition but may not be present
# if only specific language packages are used.
-dontwarn com.google.mlkit.vision.text.chinese.**
-dontwarn com.google.mlkit.vision.text.devanagari.**
-dontwarn com.google.mlkit.vision.text.japanese.**
-dontwarn com.google.mlkit.vision.text.korean.**

# General ML Kit keep rules
-keep class com.google.mlkit.** { *; }
-keep interface com.google.mlkit.** { *; }
