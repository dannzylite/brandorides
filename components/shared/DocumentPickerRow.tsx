import * as DocumentPicker from 'expo-document-picker';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { Card } from './Card';
import { Colors, Spacing, Typography } from '@/constants/theme';

export interface PickedDocument {
  uri: string;
  name: string;
  mimeType?: string;
}

interface DocumentPickerRowProps {
  label: string;
  file: PickedDocument | null;
  onPick: (file: PickedDocument) => void;
}

export function DocumentPickerRow({ label, file, onPick }: DocumentPickerRowProps) {
  const handlePick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'] });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    onPick({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
  };

  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.status} numberOfLines={1}>
            {file ? file.name : 'No file selected'}
          </Text>
        </View>
        {file ? <Ionicons name="checkmark-circle" size={22} color={Colors.primaryLight} /> : null}
      </View>
      <Button
        label={file ? 'Change File' : 'Choose File'}
        variant="secondary"
        onPress={handlePick}
        style={styles.button}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  info: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  label: {
    ...Typography.h3,
    color: Colors.text,
  },
  status: {
    ...Typography.caption,
    color: Colors.subtext,
    marginTop: Spacing.xs,
  },
  button: {
    marginTop: Spacing.xs,
  },
});
