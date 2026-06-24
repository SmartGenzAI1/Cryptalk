import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/chat_service.dart';
import '../../core/models.dart';

class NewChatScreen extends StatefulWidget {
  const NewChatScreen({super.key});

  @override
  State<NewChatScreen> createState() => _NewChatScreenState();
}

class _NewChatScreenState extends State<NewChatScreen> {
  final _searchController = TextEditingController();
  List<AppUser> _results = [];
  bool _searching = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _search(String query) async {
    if (query.trim().isEmpty) {
      setState(() => _results = []);
      return;
    }
    setState(() => _searching = true);
    try {
      final chatService = context.read<ChatService>();
      final users = await chatService.searchUsers(query);
      setState(() => _results = users);
    } catch (_) {
      setState(() => _results = []);
    } finally {
      setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New Chat')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _searchController,
              onChanged: _search,
              decoration: InputDecoration(
                hintText: 'Search by username...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                filled: true,
              ),
            ),
          ),
          if (_searching)
            const Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator())
          else if (_results.isEmpty)
            const Padding(
              padding: EdgeInsets.all(40),
              child: Center(child: Text('Search to find people', style: TextStyle(color: Colors.grey))),
            )
          else
            Expanded(
              child: ListView.builder(
                itemCount: _results.length,
                itemBuilder: (context, index) {
                  final user = _results[index];
                  return ListTile(
                    leading: CircleAvatar(
                      child: Text(user.avatarEmoji.isNotEmpty ? user.avatarEmoji[0].toUpperCase() : '?'),
                    ),
                    title: Text(user.name ?? 'Unknown'),
                    subtitle: Text('@${user.username}'),
                    onTap: () async {
                      try {
                        final chatService = context.read<ChatService>();
                        await chatService.createDirectChat(user.id);
                        if (context.mounted) Navigator.pop(context);
                      } catch (e) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Failed: $e')),
                          );
                        }
                      }
                    },
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}
