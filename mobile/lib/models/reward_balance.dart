/// Model for reward balance returned from backend
class RewardBalance {
  final String token;
  final double amount;

  RewardBalance({
    required this.token,
    required this.amount,
  });

  factory RewardBalance.fromJson(Map<String, dynamic> json) {
    return RewardBalance(
      token: json['token'] as String,
      amount: (json['amount'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'token': token,
      'amount': amount,
    };
  }

  @override
  String toString() => 'RewardBalance(token: $token, amount: $amount)';
}
