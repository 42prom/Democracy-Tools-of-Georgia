import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/activity_item.dart';
import '../../models/poll.dart';
import '../../services/interfaces/i_api_service.dart';
import '../../services/localization_service.dart';
import '../../services/service_locator.dart';
import '../../services/storage_service.dart';
import 'vote_receipt_screen.dart';

class SurveyScreen extends StatefulWidget {
  final Poll poll;

  const SurveyScreen({super.key, required this.poll});

  @override
  State<SurveyScreen> createState() => _SurveyScreenState();
}

class _SurveyScreenState extends State<SurveyScreen> {
  int _currentQuestionIndex = 0;
  bool _submitting = false;
  String _statusMessage = '';

  // Stores responses per question
  final Map<String, QuestionResponseData> _responses = {};

  List<SurveyQuestion> get _questions => widget.poll.questions ?? [];
  SurveyQuestion get _currentQuestion => _questions[_currentQuestionIndex];
  double get _progress =>
      _questions.isEmpty ? 0 : (_currentQuestionIndex + 1) / _questions.length;
  bool get _isLastQuestion => _currentQuestionIndex == _questions.length - 1;

  bool get _currentQuestionAnswered {
    final response = _responses[_currentQuestion.id];
    if (response == null) return false;

    switch (_currentQuestion.questionType) {
      case 'single_choice':
        return response.selectedOptionId != null;
      case 'multiple_choice':
        return response.selectedOptionIds != null &&
            response.selectedOptionIds!.isNotEmpty;
      case 'text':
        return response.textResponse != null &&
            response.textResponse!.trim().isNotEmpty;
      case 'rating_scale':
        return response.ratingValue != null;
      case 'ranked_choice':
        return response.rankedOptionIds != null &&
            response.rankedOptionIds!.isNotEmpty;
      default:
        return false;
    }
  }

  bool get _canProceed {
    if (!_currentQuestion.required) return true;
    return _currentQuestionAnswered;
  }

  @override
  Widget build(BuildContext context) {
    final locService = Provider.of<LocalizationService>(context);
    if (_questions.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(locService.translate('survey_title'))),
        body: Center(child: Text(locService.translate('no_questions'))),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.poll.title),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: _submitting ? null : () => _showExitDialog(),
        ),
      ),
      body: SafeArea(
        child: _submitting ? _buildSubmittingState() : _buildQuestionView(),
      ),
    );
  }

  Widget _buildSubmittingState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 24),
            Text(
              _statusMessage,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: Theme.of(context).primaryColor,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuestionView() {
    final locService = Provider.of<LocalizationService>(context);
    return Column(
      children: [
        // Progress bar
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${locService.translate('question_of')} ${_currentQuestionIndex + 1} ${locService.translate('of')} ${_questions.length}',
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: Colors.grey),
                  ),
                  Text(
                    '${(_progress * 100).round()}%',
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: Colors.grey),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: _progress,
                  minHeight: 6,
                  backgroundColor: Colors.grey.shade800,
                ),
              ),
            ],
          ),
        ),

        // Question content
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Question type badge
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Theme.of(
                      context,
                    ).primaryColor.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    _formatQuestionType(_currentQuestion.questionType),
                    style: TextStyle(
                      fontSize: 11,
                      color: Theme.of(context).primaryColor,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                if (_currentQuestion.required)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      locService.translate('required'),
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.red.shade300,
                      ),
                    ),
                  ),
                const SizedBox(height: 16),

                // Question text
                Text(
                  _currentQuestion.questionText,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    height: 1.3, // Better readability for wrapped questions
                  ),
                ),
                const SizedBox(height: 24),

                // Question-specific input
                _buildQuestionInput(),
              ],
            ),
          ),
        ),

        // Navigation buttons
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            children: [
              if (_currentQuestionIndex > 0)
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      setState(() => _currentQuestionIndex--);
                    },
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 52),
                    ),
                    child: Text(locService.translate('back')),
                  ),
                ),
              if (_currentQuestionIndex > 0) const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  onPressed: _canProceed
                      ? (_isLastQuestion ? _confirmSubmit : _nextQuestion)
                      : null,
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size(0, 52),
                  ),
                  child: Text(
                    _isLastQuestion
                        ? locService.translate('submit_survey')
                        : locService.translate('next'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildQuestionInput() {
    switch (_currentQuestion.questionType) {
      case 'single_choice':
        return _buildSingleChoice();
      case 'multiple_choice':
        return _buildMultipleChoice();
      case 'text':
        return _buildTextInput();
      case 'rating_scale':
        return _buildRatingScale();
      case 'ranked_choice':
        return _buildRankedChoice();
      default:
        return Text('Unknown question type: ${_currentQuestion.questionType}');
    }
  }

  // --- Single Choice (Radio) ---
  Widget _buildSingleChoice() {
    final selectedId = _responses[_currentQuestion.id]?.selectedOptionId;

    return Column(
      children: _currentQuestion.options.map((option) {
        final isSelected = selectedId == option.id;
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: InkWell(
            onTap: () {
              setState(() {
                _responses[_currentQuestion.id] = QuestionResponseData(
                  questionId: _currentQuestion.id,
                  selectedOptionId: option.id,
                );
              });
            },
            borderRadius: BorderRadius.circular(16),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: isSelected
                    ? Theme.of(context).primaryColor.withValues(alpha: 0.1)
                    : Colors.grey.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isSelected
                      ? Theme.of(context).primaryColor
                      : Colors.grey.shade300,
                  width: isSelected ? 2 : 1,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    isSelected
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                    color: isSelected
                        ? Theme.of(context).primaryColor
                        : Colors.grey,
                    size: 28,
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Text(
                      option.optionText,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: isSelected
                            ? FontWeight.bold
                            : FontWeight.w500,
                        height: 1.4, // Good line height for long options
                        color: isSelected
                            ? Theme.of(context).primaryColor
                            : Theme.of(context).textTheme.bodyLarge?.color,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  // --- Multiple Choice (Checkboxes) ---
  Widget _buildMultipleChoice() {
    final locService = Provider.of<LocalizationService>(context);
    final selectedIds =
        _responses[_currentQuestion.id]?.selectedOptionIds ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          locService.translate('select_all_apply'),
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: Colors.grey),
        ),
        const SizedBox(height: 8),
        ..._currentQuestion.options.map((option) {
          final isSelected = selectedIds.contains(option.id);
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InkWell(
              onTap: () {
                setState(() {
                  final newIds = List<String>.from(selectedIds);
                  if (!isSelected) {
                    newIds.add(option.id);
                  } else {
                    newIds.remove(option.id);
                  }
                  _responses[_currentQuestion.id] = QuestionResponseData(
                    questionId: _currentQuestion.id,
                    selectedOptionIds: newIds,
                  );
                });
              },
              borderRadius: BorderRadius.circular(16),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: isSelected
                      ? Theme.of(context).primaryColor.withValues(alpha: 0.1)
                      : Colors.grey.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isSelected
                        ? Theme.of(context).primaryColor
                        : Colors.grey.shade300,
                    width: isSelected ? 2 : 1,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      isSelected
                          ? Icons.check_box
                          : Icons.check_box_outline_blank,
                      color: isSelected
                          ? Theme.of(context).primaryColor
                          : Colors.grey,
                      size: 28,
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Text(
                        option.optionText,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: isSelected
                              ? FontWeight.bold
                              : FontWeight.w500,
                          height: 1.4, // Good line height for long options
                          color: isSelected
                              ? Theme.of(context).primaryColor
                              : Theme.of(context).textTheme.bodyLarge?.color,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }),
      ],
    );
  }

  // --- Text Input ---
  Widget _buildTextInput() {
    final locService = Provider.of<LocalizationService>(context);
    final maxLength =
        (_currentQuestion.config['maxLength'] as num?)?.toInt() ?? 500;
    final placeholder =
        _currentQuestion.config['placeholder'] as String? ??
        locService.translate('type_your_answer');
    final currentText = _responses[_currentQuestion.id]?.textResponse ?? '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          maxLines: 6,
          maxLength: maxLength,
          decoration: InputDecoration(
            hintText: placeholder,
            border: const OutlineInputBorder(),
            alignLabelWithHint: true,
          ),
          controller: TextEditingController.fromValue(
            TextEditingValue(
              text: currentText,
              selection: TextSelection.collapsed(offset: currentText.length),
            ),
          ),
          onChanged: (value) {
            _responses[_currentQuestion.id] = QuestionResponseData(
              questionId: _currentQuestion.id,
              textResponse: value,
            );
            // Trigger rebuild for canProceed
            setState(() {});
          },
        ),
        const SizedBox(height: 8),
        Text(
          locService.translate('response_anonymous'),
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: Colors.grey,
            fontStyle: FontStyle.italic,
          ),
        ),
      ],
    );
  }

  // --- Rating Scale ---
  Widget _buildRatingScale() {
    final locService = Provider.of<LocalizationService>(context);
    final config = _currentQuestion.config;
    final min = (config['min'] as num?)?.toInt() ?? 1;
    final max = (config['max'] as num?)?.toInt() ?? 5;
    final minLabel = config['minLabel'] as String? ?? '';
    final maxLabel = config['maxLabel'] as String? ?? '';
    final currentValue = _responses[_currentQuestion.id]?.ratingValue;

    return Column(
      children: [
        // Labels
        if (minLabel.isNotEmpty || maxLabel.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  minLabel,
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: Colors.grey),
                ),
                Text(
                  maxLabel,
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: Colors.grey),
                ),
              ],
            ),
          ),

        // Rating buttons
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: List.generate(max - min + 1, (index) {
            final value = min + index;
            final isSelected = currentValue == value;
            return GestureDetector(
              onTap: () {
                setState(() {
                  _responses[_currentQuestion.id] = QuestionResponseData(
                    questionId: _currentQuestion.id,
                    ratingValue: value,
                  );
                });
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: isSelected
                      ? Theme.of(context).primaryColor
                      : Colors.grey.shade800,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isSelected
                        ? Theme.of(context).primaryColor
                        : Colors.grey.shade600,
                    width: 2,
                  ),
                ),
                child: Center(
                  child: Text(
                    '$value',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: isSelected ? Colors.white : Colors.grey.shade300,
                    ),
                  ),
                ),
              ),
            );
          }),
        ),

        if (currentValue != null)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Text(
              '${locService.translate('you_selected')} $currentValue',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).primaryColor,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
      ],
    );
  }

  // --- Ranked Choice (drag to reorder) ---
  Widget _buildRankedChoice() {
    final locService = Provider.of<LocalizationService>(context);
    final rankedIds = _responses[_currentQuestion.id]?.rankedOptionIds ?? [];
    final maxRanks =
        (_currentQuestion.config['maxRanks'] as num?)?.toInt() ??
        _currentQuestion.options.length;

    // Options not yet ranked
    final unrankedOptions = _currentQuestion.options
        .where((opt) => !rankedIds.contains(opt.id))
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${locService.translate('tap_to_rank')} (up to $maxRanks)',
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: Colors.grey),
        ),
        const SizedBox(height: 12),

        // Ranked items
        if (rankedIds.isNotEmpty) ...[
          Text(
            locService.translate('your_ranking'),
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          ...rankedIds.asMap().entries.map((entry) {
            final rank = entry.key + 1;
            final optionId = entry.value;
            final option = _currentQuestion.options.firstWhere(
              (o) => o.id == optionId,
            );
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Theme.of(context).primaryColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: Theme.of(
                      context,
                    ).primaryColor.withValues(alpha: 0.3),
                  ),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 14,
                      backgroundColor: Theme.of(context).primaryColor,
                      child: Text(
                        '$rank',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        option.optionText,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () {
                        setState(() {
                          final newIds = List<String>.from(rankedIds);
                          newIds.remove(optionId);
                          _responses[_currentQuestion.id] =
                              QuestionResponseData(
                                questionId: _currentQuestion.id,
                                rankedOptionIds: newIds,
                              );
                        });
                      },
                    ),
                  ],
                ),
              ),
            );
          }),
          const SizedBox(height: 16),
        ],

        // Unranked items
        if (unrankedOptions.isNotEmpty && rankedIds.length < maxRanks) ...[
          Text(
            rankedIds.isEmpty
                ? locService.translate('available_options')
                : locService.translate('tap_to_add'),
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          ...unrankedOptions.map((option) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                onTap: () {
                  setState(() {
                    final newIds = List<String>.from(rankedIds);
                    newIds.add(option.id);
                    _responses[_currentQuestion.id] = QuestionResponseData(
                      questionId: _currentQuestion.id,
                      rankedOptionIds: newIds,
                    );
                  });
                },
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.grey.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.grey.shade300),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          option.optionText,
                          style: const TextStyle(fontWeight: FontWeight.w500),
                        ),
                      ),
                      const Icon(
                        Icons.add_circle_outline,
                        size: 20,
                        color: Colors.grey,
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ],
      ],
    );
  }

  // --- Navigation ---

  void _nextQuestion() {
    if (_currentQuestionIndex < _questions.length - 1) {
      setState(() => _currentQuestionIndex++);
    }
  }

  void _confirmSubmit() {
    final locService = Provider.of<LocalizationService>(context, listen: false);
    // Check all required questions are answered
    final unanswered = <int>[];
    for (int i = 0; i < _questions.length; i++) {
      if (_questions[i].required) {
        final response = _responses[_questions[i].id];
        if (response == null || !_isResponseValid(response, _questions[i])) {
          unanswered.add(i + 1);
        }
      }
    }

    if (unanswered.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${locService.translate('please_answer_required')} ${unanswered.join(', ')}',
          ),
        ),
      );
      // Navigate to first unanswered
      setState(() => _currentQuestionIndex = unanswered.first - 1);
      return;
    }

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(locService.translate('submit_survey')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${locService.translate('answered_questions')} ${_responses.length} ${locService.translate('of')} ${_questions.length} ${locService.translate('questions')}',
            ),
            const SizedBox(height: 12),
            Text(
              locService.translate('responses_anonymous'),
              style: const TextStyle(color: Colors.grey, fontSize: 13),
            ),
            const SizedBox(height: 8),
            Text(
              locService.translate('cannot_change_answers'),
              style: const TextStyle(color: Colors.grey, fontSize: 13),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(locService.translate('review')),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              _submitSurvey();
            },
            child: Text(locService.translate('submit')),
          ),
        ],
      ),
    );
  }

  bool _isResponseValid(
    QuestionResponseData response,
    SurveyQuestion question,
  ) {
    switch (question.questionType) {
      case 'single_choice':
        return response.selectedOptionId != null;
      case 'multiple_choice':
        return response.selectedOptionIds != null &&
            response.selectedOptionIds!.isNotEmpty;
      case 'text':
        return response.textResponse != null &&
            response.textResponse!.trim().isNotEmpty;
      case 'rating_scale':
        return response.ratingValue != null;
      case 'ranked_choice':
        return response.rankedOptionIds != null &&
            response.rankedOptionIds!.isNotEmpty;
      default:
        return false;
    }
  }

  Future<void> _submitSurvey() async {
    final locService = Provider.of<LocalizationService>(context, listen: false);
    final IApiService apiService = ServiceLocator.apiService;
    final StorageService storageService = StorageService();
    setState(() {
      _submitting = true;
      _statusMessage = locService.translate('requesting_challenge');
    });

    try {
      // Step 1: Challenge nonce
      setState(
        () => _statusMessage = locService.translate('step_1_4_challenge'),
      );
      final challengeResponse = await apiService.requestChallenge();
      final String nonce = challengeResponse['nonce'];
      // Step 2: Issue attestation
      setState(
        () => _statusMessage = locService.translate('step_2_4_attestation'),
      );
      final timestampBucket = DateTime.now().millisecondsSinceEpoch ~/ 60000;

      final attestationResponse = await apiService.issueAttestation(
        pollId: widget.poll.id,
        optionId: 'survey', // Survey uses different submission
        timestampBucket: timestampBucket,
        nonce: nonce,
      );
      final String attestation = attestationResponse['attestation'];

      // Step 3: Compute nullifier
      setState(
        () => _statusMessage = locService.translate('step_3_4_nullifier'),
      );
      final String nullifier = await storageService.computeNullifier(
        widget.poll.id,
      );

      // Step 4: Submit survey responses
      setState(
        () => _statusMessage = locService.translate('step_4_4_submitting'),
      );
      final responsesList = _responses.values.map((r) => r.toJson()).toList();

      final result = await apiService.submitSurvey(
        pollId: widget.poll.id,
        nullifier: nullifier,
        attestation: attestation,
        timestampBucket: timestampBucket,
        responses: responsesList,
      );

      // Extract reward info from backend response (source of truth)
      final reward = result['reward'];
      String? rewardAmount;
      String? rewardToken;
      if (reward != null && reward['issued'] == true) {
        rewardAmount = reward['amount']?.toString();
        rewardToken = reward['tokenSymbol'] as String?;
      }

      // Save activity record with backend-confirmed reward info
      await storageService.saveActivityItem(
        ActivityItem(
          pollId: widget.poll.id,
          title: widget.poll.title,
          type: widget.poll.type,
          votedAt: DateTime.now(),
          endsAt: widget.poll.endAt,
          rewardAmount: rewardAmount,
          rewardToken: rewardToken,
          referendumQuestion: widget.poll.referendumQuestion,
          electionQuestion: widget.poll.electionQuestion,
        ),
      );

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (context) => VoteReceiptScreen(
              poll: widget.poll,
              selectedOption: PollOption(
                id: 'survey',
                text: locService.translate('survey_responses'),
                displayOrder: 0,
              ),
              txHash: result['txHash'] ?? 'mock_survey_tx',
            ),
          ),
        );
      }
    } catch (e) {
      final errorStr = e.toString();
      if (errorStr.contains('409') || errorStr.contains('Already')) {
        // Self-healing: treat as success to allow dashboard refresh
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(locService.translate('survey_already_submitted')),
            ),
          );
          Navigator.of(context).popUntil((route) => route.isFirst);
        }
        return;
      }

      setState(() => _submitting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${locService.translate('failed_submit_survey')}: $e',
            ),
          ),
        );
      }
    }
  }

  void _showExitDialog() {
    final locService = Provider.of<LocalizationService>(context, listen: false);
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(locService.translate('leave_survey')),
        content: Text(locService.translate('progress_lost')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(locService.translate('stay')),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context); // close dialog
              Navigator.pop(context); // go back
            },
            child: Text(
              locService.translate('leave'),
              style: const TextStyle(color: Colors.red),
            ),
          ),
        ],
      ),
    );
  }

  String _formatQuestionType(String type) {
    final locService = Provider.of<LocalizationService>(context, listen: false);
    switch (type) {
      case 'single_choice':
        return locService.translate('single_choice');
      case 'multiple_choice':
        return locService.translate('multiple_choice');
      case 'text':
        return locService.translate('text_response');
      case 'rating_scale':
        return locService.translate('rating_scale');
      case 'ranked_choice':
        return locService.translate('ranked_choice');
      default:
        return type;
    }
  }
}

/// Receipt screen shown after survey submission
class SurveyReceiptScreen extends StatelessWidget {
  final Poll poll;
  final int questionsAnswered;
  final int totalQuestions;
  final String txHash;

  const SurveyReceiptScreen({
    super.key,
    required this.poll,
    required this.questionsAnswered,
    required this.totalQuestions,
    required this.txHash,
  });

  @override
  Widget build(BuildContext context) {
    final locService = Provider.of<LocalizationService>(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),

              // Success Icon
              const Icon(Icons.check_circle, size: 100, color: Colors.green),
              const SizedBox(height: 24),

              // Success Message
              Text(
                locService.translate('survey_submitted'),
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),

              // Receipt Details
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildRow(
                        locService.translate('survey'),
                        poll.title,
                        context,
                      ),
                      const Divider(height: 24),
                      _buildRow(
                        locService.translate('questions_answered'),
                        '$questionsAnswered ${locService.translate('of')} $totalQuestions',
                        context,
                      ),
                      const Divider(height: 24),
                      _buildRow(
                        locService.translate('transaction_hash'),
                        txHash,
                        context,
                        mono: true,
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),
              Text(
                locService.translate('responses_protected'),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Colors.grey,
                  fontStyle: FontStyle.italic,
                ),
                textAlign: TextAlign.center,
              ),

              const Spacer(),

              // Back to Home
              ElevatedButton(
                onPressed: () {
                  Navigator.of(context).popUntil((route) => route.isFirst);
                },
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 56),
                ),
                child: Text(locService.translate('back_to_home')),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRow(
    String label,
    String value,
    BuildContext context, {
    bool mono = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: Colors.grey),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
            fontWeight: FontWeight.w500,
            fontFamily: mono ? 'monospace' : null,
          ),
        ),
      ],
    );
  }
}
