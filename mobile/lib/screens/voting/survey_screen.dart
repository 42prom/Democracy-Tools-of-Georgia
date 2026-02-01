import 'package:flutter/material.dart';
import '../../models/activity_item.dart';
import '../../models/poll.dart';
import '../../services/interfaces/i_api_service.dart';
import '../../services/service_locator.dart';
import '../../services/storage_service.dart';

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
    if (_questions.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Survey')),
        body: const Center(child: Text('This survey has no questions.')),
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
                    'Question ${_currentQuestionIndex + 1} of ${_questions.length}',
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
                      'Required',
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
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
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
                    child: const Text('Back'),
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
                  child: Text(_isLastQuestion ? 'Submit Survey' : 'Next'),
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
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(
              color: isSelected
                  ? Theme.of(context).primaryColor
                  : Colors.transparent,
              width: 2,
            ),
          ),
          child: ListTile(
            leading: Icon(
              isSelected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: isSelected ? Theme.of(context).primaryColor : Colors.grey,
            ),
            title: Text(
              option.optionText,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
            onTap: () {
              setState(() {
                _responses[_currentQuestion.id] = QuestionResponseData(
                  questionId: _currentQuestion.id,
                  selectedOptionId: option.id,
                );
              });
            },
          ),
        );
      }).toList(),
    );
  }

  // --- Multiple Choice (Checkboxes) ---
  Widget _buildMultipleChoice() {
    final selectedIds =
        _responses[_currentQuestion.id]?.selectedOptionIds ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Select all that apply',
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: Colors.grey),
        ),
        const SizedBox(height: 8),
        ..._currentQuestion.options.map((option) {
          final isSelected = selectedIds.contains(option.id);
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(
                color: isSelected
                    ? Theme.of(context).primaryColor
                    : Colors.transparent,
                width: 2,
              ),
            ),
            child: CheckboxListTile(
              value: isSelected,
              onChanged: (checked) {
                setState(() {
                  final newIds = List<String>.from(selectedIds);
                  if (checked == true) {
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
              title: Text(
                option.optionText,
                style: const TextStyle(fontWeight: FontWeight.w500),
              ),
              activeColor: Theme.of(context).primaryColor,
              controlAffinity: ListTileControlAffinity.leading,
            ),
          );
        }),
      ],
    );
  }

  // --- Text Input ---
  Widget _buildTextInput() {
    final maxLength =
        (_currentQuestion.config['maxLength'] as num?)?.toInt() ?? 500;
    final placeholder =
        _currentQuestion.config['placeholder'] as String? ??
        'Type your answer...';
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
          'Your response is anonymous and will only be shown in aggregate.',
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
              'You selected: $currentValue',
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
          'Tap options to rank them (up to $maxRanks)',
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: Colors.grey),
        ),
        const SizedBox(height: 12),

        // Ranked items
        if (rankedIds.isNotEmpty) ...[
          Text(
            'Your ranking:',
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
            return Card(
              margin: const EdgeInsets.only(bottom: 4),
              color: Theme.of(context).primaryColor.withValues(alpha: 0.15),
              child: ListTile(
                leading: CircleAvatar(
                  radius: 16,
                  backgroundColor: Theme.of(context).primaryColor,
                  child: Text(
                    '#$rank',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                title: Text(option.optionText),
                trailing: IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: () {
                    setState(() {
                      final newIds = List<String>.from(rankedIds);
                      newIds.remove(optionId);
                      _responses[_currentQuestion.id] = QuestionResponseData(
                        questionId: _currentQuestion.id,
                        rankedOptionIds: newIds,
                      );
                    });
                  },
                ),
              ),
            );
          }),
          const SizedBox(height: 16),
        ],

        // Unranked items
        if (unrankedOptions.isNotEmpty && rankedIds.length < maxRanks) ...[
          Text(
            rankedIds.isEmpty ? 'Available options:' : 'Tap to add:',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          ...unrankedOptions.map((option) {
            return Card(
              margin: const EdgeInsets.only(bottom: 4),
              child: ListTile(
                title: Text(option.optionText),
                trailing: const Icon(Icons.add_circle_outline),
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
            'Please answer required question${unanswered.length > 1 ? 's' : ''}: ${unanswered.join(', ')}',
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
        title: const Text('Submit Survey'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'You have answered ${_responses.length} of ${_questions.length} questions.',
            ),
            const SizedBox(height: 12),
            const Text(
              'Your responses are anonymous and cannot be traced back to you.',
              style: TextStyle(color: Colors.grey, fontSize: 13),
            ),
            const SizedBox(height: 8),
            const Text(
              'Once submitted, you cannot change your answers.',
              style: TextStyle(color: Colors.grey, fontSize: 13),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Review'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              _submitSurvey();
            },
            child: const Text('Submit'),
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
    final IApiService apiService = ServiceLocator.apiService;
    final StorageService storageService = StorageService();
    setState(() {
      _submitting = true;
      _statusMessage = 'Requesting challenge...';
    });

    try {
      // Step 1: Challenge nonce
      setState(
        () => _statusMessage = 'Step 1/4: Requesting challenge nonce...',
      );
      final challengeResponse = await apiService.requestChallenge();
      final String nonce = challengeResponse['nonce'];
      // Step 2: Issue attestation
      setState(() => _statusMessage = 'Step 2/4: Issuing attestation...');
      final timestampBucket = DateTime.now().millisecondsSinceEpoch ~/ 60000;

      final attestationResponse = await apiService.issueAttestation(
        pollId: widget.poll.id,
        optionId: 'survey', // Survey uses different submission
        timestampBucket: timestampBucket,
        nonce: nonce,
      );
      final String attestation = attestationResponse['attestation'];

      // Step 3: Compute nullifier
      setState(() => _statusMessage = 'Step 3/4: Computing nullifier...');
      final String nullifier = await storageService.computeNullifier(
        widget.poll.id,
      );

      // Step 4: Submit survey responses
      setState(() => _statusMessage = 'Step 4/4: Submitting survey...');
      final responsesList = _responses.values.map((r) => r.toJson()).toList();

      final result = await apiService.submitSurvey(
        pollId: widget.poll.id,
        nullifier: nullifier,
        attestation: attestation,
        timestampBucket: timestampBucket,
        responses: responsesList,
      );

      // Save activity record (no response data stored)
      await storageService.saveActivityItem(ActivityItem(
        pollId: widget.poll.id,
        title: widget.poll.title,
        type: widget.poll.type,
        votedAt: DateTime.now(),
        endsAt: widget.poll.endAt,
      ));

      if (mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (context) => SurveyReceiptScreen(
              poll: widget.poll,
              questionsAnswered: _responses.length,
              totalQuestions: _questions.length,
              txHash:
                  result['txHash'] ??
                  'mock_tx_${DateTime.now().millisecondsSinceEpoch}',
            ),
          ),
        );
      }
    } catch (e) {
      setState(() => _submitting = false);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to submit survey: $e')));
      }
    }
  }

  void _showExitDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Leave Survey?'),
        content: const Text(
          'Your progress will be lost. Are you sure you want to leave?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Stay'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context); // close dialog
              Navigator.pop(context); // go back
            },
            child: const Text('Leave', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  String _formatQuestionType(String type) {
    switch (type) {
      case 'single_choice':
        return 'Single Choice';
      case 'multiple_choice':
        return 'Multiple Choice';
      case 'text':
        return 'Text Response';
      case 'rating_scale':
        return 'Rating Scale';
      case 'ranked_choice':
        return 'Ranked Choice';
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
                'Survey Submitted!',
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
                      _buildRow('Survey', poll.title, context),
                      const Divider(height: 24),
                      _buildRow(
                        'Questions Answered',
                        '$questionsAnswered of $totalQuestions',
                        context,
                      ),
                      const Divider(height: 24),
                      _buildRow(
                        'Transaction Hash',
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
                'Your responses are anonymous and protected by our privacy system.',
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
                child: const Text('Back to Home'),
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
