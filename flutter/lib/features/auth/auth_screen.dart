import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth_service.dart';

// Email+Password authentication screen matching web glassmorphic UI.
class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _emailController = TextEditingController(
    text: const String.fromEnvironment('TEST_EMAIL', defaultValue: ''),
  );
  final _passwordController = TextEditingController(
    text: const String.fromEnvironment('TEST_PASSWORD', defaultValue: ''),
  );
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
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceFirst('Exception: ', '')),
            behavior: SnackBarBehavior.floating,
            backgroundColor: const Color(0xFFEF4444),
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
    final isDesktop = MediaQuery.of(context).size.width >= 992;

    final formWidget = Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (!isDesktop) ...[
                  Center(
                    child: Column(
                      children: [
                        Image.asset(
                          'assets/logo.png',
                          width: 96,
                          height: 96,
                          fit: BoxFit.contain,
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Cryptalk',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 32,
                            fontWeight: FontWeight.bold,
                            letterSpacing: -0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),
                ],

                // Step Indicators (matching React auth-screen.tsx)
                Row(
                  mainAxisAlignment: isDesktop ? MainAxisAlignment.start : MainAxisAlignment.center,
                  children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 250),
                      width: 32,
                      height: 6,
                      decoration: BoxDecoration(
                        color: _isLogin
                            ? const Color(0xFF10B981)
                            : Colors.white.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                    const SizedBox(width: 8),
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 250),
                      width: 32,
                      height: 6,
                      decoration: BoxDecoration(
                        color: !_isLogin
                            ? const Color(0xFF10B981)
                            : Colors.white.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Form Heading & Subheading
                Text(
                  _isLogin ? 'Welcome back' : 'Create account',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    letterSpacing: -0.5,
                  ),
                  textAlign: isDesktop ? TextAlign.left : TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  _isLogin
                      ? 'Sign in with your email to continue.'
                      : 'Email-based — no phone number required.',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.6),
                    fontSize: 14,
                  ),
                  textAlign: isDesktop ? TextAlign.left : TextAlign.center,
                ),
                const SizedBox(height: 32),

                // Email Input Label & Field
                const Text(
                  'Email',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _emailController,
                  style: const TextStyle(color: Colors.white, fontSize: 15),
                  decoration: InputDecoration(
                    hintText: 'you@example.com',
                    hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.35)),
                    filled: true,
                    fillColor: Colors.white.withValues(alpha: 0.05),
                    prefixIcon: Icon(
                      Icons.mail_outline,
                      size: 20,
                      color: Colors.white.withValues(alpha: 0.5),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(
                        color: Colors.white.withValues(alpha: 0.1),
                      ),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: const BorderSide(
                        color: Color(0xFF10B981),
                        width: 1.5,
                      ),
                    ),
                    errorBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(
                        color: Colors.redAccent.withValues(alpha: 0.8),
                        width: 1.5,
                      ),
                    ),
                    focusedErrorBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: const BorderSide(
                        color: Colors.redAccent,
                        width: 1.5,
                      ),
                    ),
                  ),
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autocorrect: false,
                  enableSuggestions: false,
                  validator: _validateEmail,
                ),
                const SizedBox(height: 20),

                // Password Input Label & Field
                const Text(
                  'Password',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _passwordController,
                  style: const TextStyle(color: Colors.white, fontSize: 15),
                  decoration: InputDecoration(
                    hintText: '••••••••',
                    hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.35)),
                    filled: true,
                    fillColor: Colors.white.withValues(alpha: 0.05),
                    prefixIcon: Icon(
                      Icons.lock_outline,
                      size: 20,
                      color: Colors.white.withValues(alpha: 0.5),
                    ),
                    suffixIcon: TextButton(
                      onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                      style: TextButton.styleFrom(
                        foregroundColor: Colors.white.withValues(alpha: 0.6),
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                      ),
                      child: Text(
                        _obscurePassword ? 'Show' : 'Hide',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withValues(alpha: 0.7),
                        ),
                      ),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(
                        color: Colors.white.withValues(alpha: 0.1),
                      ),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: const BorderSide(
                        color: Color(0xFF10B981),
                        width: 1.5,
                      ),
                    ),
                    errorBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(
                        color: Colors.redAccent.withValues(alpha: 0.8),
                        width: 1.5,
                      ),
                    ),
                    focusedErrorBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: const BorderSide(
                        color: Colors.redAccent,
                        width: 1.5,
                      ),
                    ),
                  ),
                  obscureText: _obscurePassword,
                  textInputAction: TextInputAction.done,
                  validator: _validatePassword,
                  onFieldSubmitted: (_) {
                    if (!_loading) _submit();
                  },
                ),
                const SizedBox(height: 28),

                // Emerald Gradient Submit Button
                InkWell(
                  onTap: _loading ? null : _submit,
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    height: 50,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF10B981), Color(0xFF0D9488)],
                      ),
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF10B981).withValues(alpha: 0.3),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    alignment: Alignment.center,
                    child: _loading
                        ? const SizedBox(
                            height: 22,
                            width: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.5,
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                            ),
                          )
                        : Text(
                            _isLogin ? 'Sign in' : 'Create account',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),
                const SizedBox(height: 20),

                // Toggle Auth Mode Link
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      _isLogin ? "Don't have an account? " : 'Already have an account? ',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.6),
                        fontSize: 14,
                      ),
                    ),
                    GestureDetector(
                      onTap: _loading ? null : () => setState(() => _isLogin = !_isLogin),
                      child: Text(
                        _isLogin ? 'Sign up' : 'Sign in',
                        style: const TextStyle(
                          color: Color(0xFF34D399),
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),

                // Footer Lock Note
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.lock_outline,
                      size: 14,
                      color: Colors.white.withValues(alpha: 0.5),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'Email-based · No phone · No tracking',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.5),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );

    return Scaffold(
      backgroundColor: const Color(0xFF0B0F17),
      body: LayoutBuilder(
        builder: (context, constraints) {
          if (constraints.maxWidth >= 992) {
            return Row(
              children: [
                // Desktop Split Banner (Left side)
                Expanded(
                  child: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          Color(0xFF059669),
                          Color(0xFF0F766E),
                          Color(0xFF155E75),
                        ],
                      ),
                    ),
                    child: CustomPaint(
                      painter: DotPatternPainter(color: Colors.white.withValues(alpha: 0.12)),
                      child: SafeArea(
                        child: Padding(
                          padding: const EdgeInsets.all(48.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              // Top Brand Header
                              Row(
                                children: [
                                  Image.asset(
                                    'assets/logo.png',
                                    width: 56,
                                    height: 56,
                                    fit: BoxFit.contain,
                                  ),
                                  const SizedBox(width: 12),
                                  const Text(
                                    'Cryptalk',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 28,
                                      fontWeight: FontWeight.bold,
                                      letterSpacing: -0.5,
                                    ),
                                  ),
                                ],
                              ),

                              // Middle Headline & Glass Cards
                              ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 480),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'Private by default.\nFast by design.',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 48,
                                        fontWeight: FontWeight.bold,
                                        height: 1.15,
                                        letterSpacing: -1,
                                      ),
                                    ),
                                    const SizedBox(height: 16),
                                    Text(
                                      'No phone number required. End-to-end encrypted everything. Your data stays yours.',
                                      style: TextStyle(
                                        color: Colors.white.withValues(alpha: 0.85),
                                        fontSize: 18,
                                        height: 1.4,
                                      ),
                                    ),
                                    const SizedBox(height: 32),
                                    _buildFeatureItem(
                                      icon: Icons.shield_outlined,
                                      title: 'Zero-knowledge server',
                                      desc: "We can't read your messages",
                                    ),
                                    const SizedBox(height: 12),
                                    _buildFeatureItem(
                                      icon: Icons.bolt,
                                      title: 'Instant delivery',
                                      desc: 'Real-time WebSocket sync',
                                    ),
                                    const SizedBox(height: 12),
                                    _buildFeatureItem(
                                      icon: Icons.groups_outlined,
                                      title: 'Expiring groups',
                                      desc: 'Perfect for events & temp chats',
                                    ),
                                  ],
                                ),
                              ),

                              // Bottom Tagline
                              Row(
                                children: [
                                  Icon(
                                    Icons.lock_outline,
                                    size: 14,
                                    color: Colors.white.withValues(alpha: 0.6),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    'Email-based · No phone · No tracking',
                                    style: TextStyle(
                                      color: Colors.white.withValues(alpha: 0.6),
                                      fontSize: 14,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),

                // Desktop Form Panel (Right side)
                Expanded(
                  child: Container(
                    color: const Color(0xFF0B0F17),
                    child: formWidget,
                  ),
                ),
              ],
            );
          } else {
            // Mobile View
            return SafeArea(child: formWidget);
          }
        },
      ),
    );
  }

  Widget _buildFeatureItem({
    required IconData icon,
    required String title,
    required String desc,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: Colors.white, size: 22),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  desc,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.75),
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class DotPatternPainter extends CustomPainter {
  final Color color;
  const DotPatternPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeCap = StrokeCap.round;

    const double spacing = 28.0;
    for (double x = 0.0; x < size.width; x += spacing) {
      for (double y = 0.0; y < size.height; y += spacing) {
        canvas.drawCircle(Offset(x, y), 1.0, paint);
      }
    }
    for (double x = spacing / 2; x < size.width; x += spacing) {
      for (double y = spacing / 2; y < size.height; y += spacing) {
        canvas.drawCircle(Offset(x, y), 1.0, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
