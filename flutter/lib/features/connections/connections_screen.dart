import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth_service.dart';
import '../../core/chat_service.dart';
import '../../core/models.dart';

class ConnectionsScreen extends StatefulWidget {
  const ConnectionsScreen({super.key});

  @override
  State<ConnectionsScreen> createState() => _ConnectionsScreenState();
}

class _ConnectionsScreenState extends State<ConnectionsScreen> {
  final _searchController = TextEditingController();
  List<AppUser> _results = [];
  List<dynamic> _requests = [];
  List<AppUser> _connections = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final chatService = context.read<ChatService>();
      final connData = await chatService._api.get('/api/social/connections');
      final reqData = await chatService._api.get('/api/social/requests');
      if (mounted)
      setState(() {
        _connections = (connData['connections'] as List).map((u) => AppUser.fromJson(u)).toList();
        _requests = reqData['requests'] as List;
      });
    } catch (e) { debugPrint('Error: $e'); }
  }

  Future<void> _search(String q) async {
    if (q.trim().isEmpty) {
      if (mounted)
      setState(() => _results = []);
      return;
    }
    setState(() => _loading = true);
    try {
      final chatService = context.read<ChatService>();
      final users = await chatService.searchUsers(q);
      setState(() => _results = users);
    } catch (_) {
      setState(() => _results = []);
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _connect(String username) async {
    try {
      final chatService = context.read<ChatService>();
      await chatService._api.post('/api/social/connect', {'to_username': username});
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Request sent to @$username')));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
    }
  }

  Future<void> _accept(String requestId) async {
    try {
      await context.read<ChatService>()._api.post('/api/social/accept/$requestId');
      _loadData();
    } catch (e) { debugPrint('Error: $e'); }
  }

  Future<void> _decline(String requestId) async {
    try {
      await context.read<ChatService>()._api.post('/api/social/decline/$requestId');
      _loadData();
    } catch (e) { debugPrint('Error: $e'); }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Connections'),
          bottom: const TabBar(
            tabs: [
              Tab(icon: Icon(Icons.search), text: 'Find'),
              Tab(text: 'Requests'),
              Tab(icon: Icon(Icons.people), text: 'Mine'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _buildFindTab(),
            _buildRequestsTab(),
            _buildConnectionsTab(),
          ],
        ),
      ),
    );
  }

  Widget _buildFindTab() {
    return Column(
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
            ),
          ),
        ),
        if (_loading)
          const Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator())
        else if (_results.isEmpty)
          const Padding(padding: EdgeInsets.all(40), child: Text('Search to find people', style: TextStyle(color: Colors.grey)))
        else
          Expanded(
            child: ListView.builder(
              itemCount: _results.length,
              itemBuilder: (context, index) {
                final u = _results[index];
                return ListTile(
                  leading: CircleAvatar(child: Text(u.avatarEmoji.isNotEmpty ? u.avatarEmoji[0] : '?')),
                  title: Text(u.name ?? 'Unknown'),
                  subtitle: Text('@${u.username}'),
                  trailing: IconButton(
                    icon: const Icon(Icons.person_add),
                    onPressed: () => _connect(u.username ?? ''),
                  ),
                );
              },
            ),
          ),
      ],
    );
  }

  Widget _buildRequestsTab() {
    if (_requests.isEmpty) {
      return const Center(child: Text('No pending requests', style: TextStyle(color: Colors.grey)));
    }
    return ListView.builder(
      itemCount: _requests.length,
      itemBuilder: (context, index) {
        final r = _requests[index];
        final from = AppUser.fromJson(r['from']);
        return ListTile(
          leading: CircleAvatar(child: Text(from.avatarEmoji.isNotEmpty ? from.avatarEmoji[0] : '?')),
          title: Text(from.name ?? 'Unknown'),
          subtitle: Text('@${from.username}'),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(icon: const Icon(Icons.check, color: Colors.green), onPressed: () => _accept(r['id'])),
              IconButton(icon: const Icon(Icons.close, color: Colors.red), onPressed: () => _decline(r['id'])),
            ],
          ),
        );
      },
    );
  }

  Widget _buildConnectionsTab() {
    if (_connections.isEmpty) {
      return const Center(child: Text('No connections yet', style: TextStyle(color: Colors.grey)));
    }
    return ListView.builder(
      itemCount: _connections.length,
      itemBuilder: (context, index) {
        final u = _connections[index];
        return ListTile(
          leading: CircleAvatar(child: Text(u.avatarEmoji.isNotEmpty ? u.avatarEmoji[0] : '?')),
          title: Text(u.name ?? 'Unknown'),
          subtitle: Text('@${u.username}'),
        );
      },
    );
  }
}
