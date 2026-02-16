enum TransactionType { send, receive }

enum TransactionStatus { pending, confirmed, failed }

class Transaction {
  final String id;
  final TransactionType type;
  final TransactionStatus status;
  final String amount;
  final String token;
  final String address; // from/to address
  final DateTime timestamp;
  final String? txHash;
  final String? note;

  Transaction({
    required this.id,
    required this.type,
    required this.status,
    required this.amount,
    required this.token,
    required this.address,
    required this.timestamp,
    this.txHash,
    this.note,
  });

  factory Transaction.fromJson(Map<String, dynamic> json) {
    return Transaction(
      id: json['id'],
      type: json['type'] == 'send'
          ? TransactionType.send
          : TransactionType.receive,
      status: TransactionStatus.values.firstWhere(
        (s) => s.name == json['status'],
        orElse: () => TransactionStatus.pending,
      ),
      amount: json['amount'],
      token: json['token'] ?? 'DTG',
      address: json['address'],
      timestamp: DateTime.parse(json['timestamp']),
      txHash: json['txHash'],
      note: json['note'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'type': type.name,
      'status': status.name,
      'amount': amount,
      'token': token,
      'address': address,
      'timestamp': timestamp.toIso8601String(),
      'txHash': txHash,
      'note': note,
    };
  }
}
