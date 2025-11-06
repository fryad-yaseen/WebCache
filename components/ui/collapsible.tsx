import { PropsWithChildren, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Box, Text } from '@/theme/restyle';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@shopify/restyle';
import type { Theme } from '@/theme/restyle';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useTheme<Theme>();

  return (
    <Box>
      <Pressable
        style={styles.heading}
        onPress={() => setIsOpen((value) => !value)}>
        <IconSymbol
          name="chevron.right"
          size={18}
          weight="medium"
          color={theme.colors.text}
          style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
        />

        <Text variant="defaultSemiBold">{title}</Text>
      </Pressable>
      {isOpen && <Box style={styles.content}>{children}</Box>}
    </Box>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  content: {
    marginTop: 6,
    marginLeft: 24,
  },
});
