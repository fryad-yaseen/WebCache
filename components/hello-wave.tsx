import Animated from 'react-native-reanimated';
import { Text } from '@/theme/restyle';

const AnimatedText = Animated.createAnimatedComponent(Text);

export function HelloWave() {
  return (
    <AnimatedText
      style={{
        fontSize: 28,
        lineHeight: 32,
        marginTop: -6,
        // The following web-only style keys enable a simple wave effect
        // and are ignored on native.
        // @ts-ignore
        animationName: {
          '50%': { transform: [{ rotate: '25deg' }] },
        },
        // @ts-ignore
        animationIterationCount: 4,
        // @ts-ignore
        animationDuration: '300ms',
      }}>
      👋
    </AnimatedText>
  );
}
