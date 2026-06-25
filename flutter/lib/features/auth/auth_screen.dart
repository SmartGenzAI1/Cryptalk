import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth_service.dart';

// email+password auth. toggles between sign in / create account.
class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLogin = true;
  bool _loading = false;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (mounted) setState(() => _loading = true);
    try {
      final auth = context.read<AuthService>();
      if (_isLogin) {
        await auth.login(email, password);
      } else {
        await auth.register(email, password);
      }
      // AppRouter watches AuthService and rebuilds when currentUser changes.
      // after register, user isn't onboarded yet so router shows OnboardingScreen.
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceFirst('Exception: ', '')),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String? _validateEmail(String? v) {
    final t = (v ?? '').trim();
    if (t.isEmpty) return 'Email is required';
    final re = RegExp(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$');
    if (!re.hasMatch(t)) return 'Enter a valid email';
    return null;
  }

  String? _validatePassword(String? v) {
    final t = v ?? '';
    if (t.length < 6) return 'At least 6 characters';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // logo + brand
                    Container(
                      width: 96,
                      height: 96,
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(
                        color: Color(0xFF10b981),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.lock_person_outlined,
                        size: 48,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Cryptalk',
                      style: Theme.of(context)
                          .textTheme
                          .headlineMedium
                          ?.copyWith(fontWeight: FontWeight.bold),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Private by default. Fast by design.',
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(color: Colors.grey),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 32),
                    TextFormField(
                      controller: _emailController,
                      decoration: const InputDecoration(
                        labelText: 'Email',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.email_outlined),
                        hintText: 'you@example.com',
                      ),
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autocorrect: false,
                      enableSuggestions: false,
                      validator: _validateEmail,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _passwordController,
                      decoration: InputDecoration(
                        labelText: 'Password',
                        border: const OutlineInputBorder(),
                        prefixIcon: const Icon(Icons.lock_outline),
                        hintText: 'At least 6 characters',
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                          onPressed: () => setState(
                              () => _obscurePassword = !_obscurePassword),
                          tooltip: _obscurePassword
                              ? 'Show password'
                              : 'Hide password',
                        ),
                      ),
                      obscureText: _obscurePassword,
                      textInputAction: TextInputAction.done,
                      validator: _validatePassword,
                      onFieldSubmitted: (_) {
                        if (!_loading) _submit();
                      },
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _loading ? null : _submit,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(52),
                        textStyle: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      child: _loading
                          ? const SizedBox(
                              height: 22,
                              width: 22,
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(_isLogin ? 'Sign In' : 'Create Account'),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: _loading
                          ? null
                          : () => setState(() => _isLogin = !_isLogin),
                      style: TextButton.styleFrom(
                        minimumSize: const Size.fromHeight(44),
                      ),
                      child: Text(
                        _isLogin
                            ? "Don't have an account? Sign up"
                            : 'Already have an account? Sign in',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
