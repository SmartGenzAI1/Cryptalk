import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth_service.dart';
import '../../core/chat_service.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final user = auth.currentUser;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          if (user != null) ...[
            ListTile(
              leading: CircleAvatar(
                backgroundColor: Colors.green,
                child: Text(user.avatarEmoji.isNotEmpty ? user.avatarEmoji[0] : '?'),
              ),
              title: Text(user.name ?? 'Unknown'),
              subtitle: Text('@${user.username}'),
            ),
            const Divider(),
          ],
          ListTile(
            leading: const Icon(Icons.person),
            title: const Text('Edit Profile'),
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileEditScreen())),
          ),
          ListTile(
            leading: const Icon(Icons.people),
            title: const Text('Connections'),
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ConnectionsScreenPlaceholder())),
          ),
          ListTile(
            leading: const Icon(Icons.block),
            title: const Text('Blocked Users'),
            onTap: () async {
              try {
                final data = await context.read<ChatService>()._api.get('/api/social/blocked');
                final blocked = data['blocked'] as List;
                if (!context.mounted) return;
                showDialog(
                  context: context,
                  builder: (_) => AlertDialog(
                    title: const Text('Blocked Users'),
                    content: SizedBox(
                      width: double.maxFinite,
                      child: blocked.isEmpty
                          ? const Text('No blocked users')
                          : ListView.builder(
                              shrinkWrap: true,
                              itemCount: blocked.length,
                              itemBuilder: (context, i) => ListTile(
                                title: Text(blocked[i]['name'] ?? 'Unknown'),
                                subtitle: Text('@${blocked[i]['username']}'),
                              ),
                            ),
                    ),
                    actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
                  ),
                );
              } catch (_) {}
            },
          ),
          ListTile(
            leading: const Icon(Icons.search),
            title: const Text('Search All Chats'),
            onTap: () {
              final controller = TextEditingController();
              showDialog(
                context: context,
                builder: (_) => AlertDialog(
                  title: const Text('Search Messages'),
                  content: TextField(
                    controller: controller,
                    decoration: const InputDecoration(hintText: 'Search...'),
                    onSubmitted: (q) async {
                      try {
                        final data = await context.read<ChatService>()._api.get('/api/search?q=${Uri.encodeComponent(q)}');
                        final results = data['results'] as List;
                        if (!context.mounted) return;
                        Navigator.pop(context);
                        showDialog(
                          context: context,
                          builder: (_) => AlertDialog(
                            title: Text('${results.length} results'),
                            content: SizedBox(
                              width: double.maxFinite,
                              child: results.isEmpty
                                  ? const Text('No results')
                                  : ListView.builder(
                                      shrinkWrap: true,
                                      itemCount: results.length,
                                      itemBuilder: (context, i) => ListTile(
                                        title: Text(results[i]['chatTitle']),
                                        subtitle: Text(results[i]['content']),
                                      ),
                                    ),
                            ),
                            actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
                          ),
                        );
                      } catch (_) {}
                    },
                  ),
                  actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel'))],
                ),
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.report, color: Colors.orange),
            title: const Text('Report a Problem'),
            onTap: () {
              final controller = TextEditingController();
              showDialog(
                context: context,
                builder: (_) => AlertDialog(
                  title: const Text('Report'),
                  content: TextField(
                    controller: controller,
                    decoration: const InputDecoration(hintText: 'Describe the issue...'),
                    maxLines: 3,
                  ),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                    TextButton(
                      onPressed: () async {
                        try {
                          await context.read<ChatService>()._api.post('/api/reports', {'reason': controller.text});
                          if (!context.mounted) return;
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Report submitted')));
                        } catch (_) {}
                      },
                      child: const Text('Submit'),
                    ),
                  ],
                ),
              );
            },
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: const Text('Sign Out', style: TextStyle(color: Colors.red)),
            onTap: () async {
              await auth.logout();
            },
          ),
          ListTile(
            leading: const Icon(Icons.delete_forever, color: Colors.red),
            title: const Text('Delete Account', style: TextStyle(color: Colors.red)),
            onTap: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (_) => AlertDialog(
                  title: const Text('Delete Account'),
                  content: const Text('This permanently deletes all your data. This cannot be undone.'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                    TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete', style: TextStyle(color: Colors.red))),
                  ],
                ),
              );
              if (confirmed == true) {
                try {
                  await context.read<ChatService>()._api.delete('/api/account');
                  await auth.logout();
                } catch (_) {}
              }
            },
          ),
          const Divider(),
          const Padding(padding: EdgeInsets.all(16), child: Text('Cryptalk v1.0.0', style: TextStyle(color: Colors.grey))),
        ],
      ),
    );
  }
}

class ProfileEditScreen extends StatefulWidget {
  const ProfileEditScreen({super.key});

  @override
  State<ProfileEditScreen> createState() => _ProfileEditScreenState();
}

class _ProfileEditScreenState extends State<ProfileEditScreen> {
  final _nameController = TextEditingController();
  final _bioController = TextEditingController();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthService>().currentUser;
    _nameController.text = user?.name ?? '';
    _bioController.text = user?.bio ?? '';
  }

  @override
  void dispose() {
    _nameController.dispose();
    _bioController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await context.read<ChatService>()._api.patch('/api/users/me', {
        'name': _nameController.text,
        'bio': _bioController.text,
      });
      if (mounted) Navigator.pop(context);
    } catch (_) {}
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit Profile')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: 'Display Name', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _bioController,
              decoration: const InputDecoration(labelText: 'Bio', border: OutlineInputBorder()),
              maxLines: 3,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving ? const CircularProgressIndicator(strokeWidth: 2) : const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}

class ConnectionsScreenPlaceholder extends StatelessWidget {
  const ConnectionsScreenPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return const ConnectionsScreen();
  }
}
