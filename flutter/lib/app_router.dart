import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/auth_service.dart';
import 'features/auth/auth_screen.dart';
import 'features/auth/onboarding_screen.dart';
import 'features/chat/chat_list_screen.dart';

// picks screen from auth state — AppRouter watches AuthService so we don't
// need explicit Navigator.pushReplacement between login/onboarding/chat list
class AppRouter extends StatefulWidget {
  const AppRouter({super.key});

  @override
  State<AppRouter> createState() => _AppRouterState();
}

class _AppRouterState extends State<AppRouter> {
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final auth = context.read<AuthService>();
    await auth.getMe();
    if (mounted) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final auth = context.watch<AuthService>();
    final user = auth.currentUser;

    if (user == null) return const AuthScreen();
    if (!user.isOnboarded) return const OnboardingScreen();
    return const ChatListScreen();
  }
}
