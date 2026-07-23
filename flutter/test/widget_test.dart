import 'package:flutter_test/flutter_test.dart';
import 'package:cryptalk/main.dart';
import 'package:cryptalk/core/models.dart';

void main() {
  testWidgets('CryptalkApp initializes correctly', (WidgetTester tester) async {
    await tester.pumpWidget(const CryptalkApp());
    expect(find.byType(CryptalkApp), findsOneWidget);
  });

  group('Message Model Tests', () {
    test('Message deserializes 5-stage status correctly', () {
      final json = {
        'id': 'msg1',
        'chatId': 'chat1',
        'content': 'Hello Cryptalk',
        'type': 'text',
        'senderId': 'user1',
        'sender': {'id': 'user1', 'name': 'Alice', 'username': 'alice'},
        'status': 'read',
        'createdAt': '2026-07-23T12:00:00.000Z',
        'replyTo': {
          'id': 'reply1',
          'content': 'Previous msg',
          'senderName': 'Alice'
        }
      };

      final msg = Message.fromJson(json);
      expect(msg.id, equals('msg1'));
      expect(msg.status, equals('read'));
      expect(msg.replyTo?.senderName, equals('Alice'));

      final serialized = msg.toJson();
      expect(serialized['status'], equals('read'));
      expect(serialized['replyTo']['senderName'], equals('Alice'));
    });

    test('Message copyWith status transition works', () {
      final msg = Message(
        id: 'msg2',
        chatId: 'chat1',
        content: 'Testing',
        type: 'text',
        senderId: 'user1',
        sender: AppUser(id: 'user1', name: 'Alice', username: 'alice'),
        status: 'pending',
        createdAt: DateTime.now().toIso8601String(),
      );

      expect(msg.status, equals('pending'));
      final updated = msg.copyWith(status: 'delivered');
      expect(updated.status, equals('delivered'));
      expect(updated.id, equals('msg2'));
    });
  });
}
