package messaging.dtg

import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    companion object {
        private const val ATTESTATION_CHANNEL = "messaging.dtg/device_attestation"
    }

    private val integrityManager: StandardIntegrityManager by lazy {
        IntegrityManagerFactory.createStandard(applicationContext)
    }

    @Volatile
    private var tokenProvider: StandardIntegrityManager.StandardIntegrityTokenProvider? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            ATTESTATION_CHANNEL
        ).setMethodCallHandler(::handleAttestationCall)

        if (BuildConfig.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER > 0L) {
            prepareTokenProvider()
        }
    }

    private fun handleAttestationCall(call: MethodCall, result: MethodChannel.Result) {
        if (call.method != "playIntegrityToken") {
            result.notImplemented()
            return
        }

        val requestHash = call.argument<String>("nonce")?.trim().orEmpty()
        if (!requestHash.matches(Regex("^[a-f0-9]{64}$"))) {
            result.error("INVALID_REQUEST_HASH", "A SHA-256 request hash is required.", null)
            return
        }
        if (BuildConfig.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER <= 0L) {
            result.error(
                "PLAY_INTEGRITY_NOT_CONFIGURED",
                "The Google Cloud project number is not configured.",
                null
            )
            return
        }

        requestToken(requestHash, result, allowProviderRefresh = true)
    }

    private fun prepareTokenProvider(
        onReady: ((StandardIntegrityManager.StandardIntegrityTokenProvider) -> Unit)? = null,
        onFailure: ((Exception) -> Unit)? = null
    ) {
        val cached = tokenProvider
        if (cached != null) {
            onReady?.invoke(cached)
            return
        }

        val request = StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
            .setCloudProjectNumber(BuildConfig.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER)
            .build()

        integrityManager.prepareIntegrityToken(request)
            .addOnSuccessListener { provider ->
                tokenProvider = provider
                onReady?.invoke(provider)
            }
            .addOnFailureListener { error ->
                tokenProvider = null
                onFailure?.invoke(error)
            }
    }

    private fun requestToken(
        requestHash: String,
        result: MethodChannel.Result,
        allowProviderRefresh: Boolean
    ) {
        val provider = tokenProvider
        if (provider == null) {
            prepareTokenProvider(
                onReady = { prepared ->
                    requestTokenWithProvider(prepared, requestHash, result, allowProviderRefresh)
                },
                onFailure = { error ->
                    result.error("PLAY_INTEGRITY_PREPARATION_FAILED", error.javaClass.simpleName, null)
                }
            )
            return
        }
        requestTokenWithProvider(provider, requestHash, result, allowProviderRefresh)
    }

    private fun requestTokenWithProvider(
        provider: StandardIntegrityManager.StandardIntegrityTokenProvider,
        requestHash: String,
        result: MethodChannel.Result,
        allowProviderRefresh: Boolean
    ) {
        val request = StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
            .setRequestHash(requestHash)
            .build()

        provider.request(request)
            .addOnSuccessListener { response -> result.success(response.token()) }
            .addOnFailureListener { error ->
                tokenProvider = null
                if (allowProviderRefresh) {
                    prepareTokenProvider(
                        onReady = { refreshed ->
                            requestTokenWithProvider(
                                refreshed,
                                requestHash,
                                result,
                                allowProviderRefresh = false
                            )
                        },
                        onFailure = { preparationError ->
                            result.error(
                                "PLAY_INTEGRITY_PREPARATION_FAILED",
                                preparationError.javaClass.simpleName,
                                null
                            )
                        }
                    )
                } else {
                    result.error("PLAY_INTEGRITY_FAILED", error.javaClass.simpleName, null)
                }
            }
    }
}
