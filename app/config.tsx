import { Picker } from '@react-native-picker/picker';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import TransmissionPage from './TransmissionPage';

// Types
interface IpPortPair {
  id: string;
  ip: string;
  port: string;
}

interface DeviceConfig {
  backend: string;
  ipPortPairs: IpPortPair[];
  deviceImei: string;
  vendorId: string;
  vehicleNumber: string;
  networkProvider: 'Airtel' | 'Vodafone' | 'BSNL' | '';
  firmwareVersion: string;
  useGpsCoordinates: boolean;
  latitude: string;
  longitude: string;
}

interface PacketResponse {
  id: string;
  timestamp: string;
  packet: string;
  host: string;
  port: string;
  response: string;
  status: 'success' | 'error';
}

// IpPortPair Component
interface IpPortPairProps {
  pair: IpPortPair;
  index: number;
  onIpChange: (id: string, ip: string) => void;
  onPortChange: (id: string, port: string) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

const IpPortPairComponent: React.FC<IpPortPairProps> = ({
  pair,
  index,
  onIpChange,
  onPortChange,
  onRemove,
  canRemove,
}) => {
  return (
    <View style={ipPortStyles.container}>
      <View style={ipPortStyles.header}>
        <Text style={ipPortStyles.title}>Server {index + 1}</Text>
        {canRemove && (
          <TouchableOpacity
            style={ipPortStyles.removeButton}
            onPress={() => onRemove(pair.id)}
            activeOpacity={0.7}
          >
            <Icon name="delete" size={20} color="#FF5252" />
          </TouchableOpacity>
        )}
      </View>
      <View style={ipPortStyles.inputRow}>
        <View style={ipPortStyles.inputContainer}>
          <Text style={ipPortStyles.inputLabel}>IP Address</Text>
          <TextInput
            style={ipPortStyles.input}
            placeholder="34.225.227.181"
            value={pair.ip}
            onChangeText={(value) => onIpChange(pair.id, value)}
            keyboardType="default"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={ipPortStyles.inputContainer}>
          <Text style={ipPortStyles.inputLabel}>Port</Text>
          <TextInput
            style={ipPortStyles.input}
            placeholder="5001"
            value={pair.port}
            onChangeText={(value) => onPortChange(pair.id, value)}
            keyboardType="numeric"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>
    </View>
  );
};

// Packet functions
function calculateChecksum(sentence: string): string {
  let checksum = 0;
  for (let i = 1; i < sentence.length; i++) {
    checksum ^= sentence.charCodeAt(i);
  }
  return checksum.toString(16).toUpperCase().padStart(2, '0');
}

function buildPvtPacket(input: any): string {
  const now = new Date();
  const pad = (num: number, size: number) => num.toString().padStart(size, '0');
  const dateStr = `${pad(now.getDate(), 2)}${pad(now.getMonth() + 1, 2)}${now.getFullYear()}`;
  const timeStr = `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`;

  const fields = [
    '$PVT',
    input.vendorId || 'VNDR',
    input.firmwareVersion || 'FIRMWAREVER1.0',
    'NR',
    '1',
    'L',
    input.deviceImei,
    (input.vehicleNumber || '').replace(/[^A-Z0-9]/gi, '').padStart(16, '0'),
    '1',
    dateStr,
    timeStr,
    input.latitude || '31.589618',
    'N',
    input.longitude || '75.875231',
    'E',
    '0',
    '117.58',
    '39',
    '286.7',
    '0.42',
    '0.43',
    input.networkProvider || 'AIRTEL',
    '0',
    '1',
    '12.2',
    '4.1',
    '0',
    'C',
    '12',
    '404',
    '53',
    '16C7',
    'E4C2',
    '2138', '700000', '29',
    '2137', '700000', '21',
    '2136', '700000', '21',
    '968A', '70000', '19',
    '0000', '0000', '00',
    '0',
    '492894',
    '00AC'
  ];

  const payloadWithoutChecksum = fields.join(',');
  const checksum = calculateChecksum(payloadWithoutChecksum);
  return `${payloadWithoutChecksum}*${checksum}`;
}

function buildLoginPacket(input: any): string {
  const fields = [
    '$LGN',
    input.vendorId || 'VNDR',
    input.deviceImei,
    input.firmwareVersion || 'FIRMWAREVER1.0',
    'AIS140',
    input.latitude || '31.589618',
    input.longitude || '75.875231'
  ];

  const payloadWithoutChecksum = fields.join(',');
  const checksum = calculateChecksum(payloadWithoutChecksum);
  return `${payloadWithoutChecksum}*${checksum}`;
}

// HTTP Connection Manager
class HTTPConnectionManager {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private backendUrl = 'https://ais-140-emulator-be.vercel.app/sendpacket';

  async sendPacket(packet: string, host: string, port: string, onResponse: (response: PacketResponse) => void) {
    const timestamp = new Date().toLocaleTimeString();
    const packetId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const payload = {
        packet: packet,
        PORT: port,
        HOST: host
      };

      console.log('📤 Sending packet:', payload);

      const response = await fetch(this.backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log('📥 Response:', responseText);

      onResponse({
        id: packetId,
        timestamp,
        packet,
        host,
        port,
        response: responseText || 'Success',
        status: response.ok ? 'success' : 'error'
      });

    } catch (error) {
      console.error('🚨 Error sending packet:', error);

      onResponse({
        id: packetId,
        timestamp,
        packet,
        host,
        port,
        response: error instanceof Error ? error.message : 'Unknown error',
        status: 'error'
      });
    }
  }

  startTransmission(serverConfigs: { ip: string, port: string, id: string }[], deviceConfig: any, onResponse: (response: PacketResponse) => void) {
    console.log('🚀 Starting HTTP transmission to', serverConfigs.length, 'servers');

    // Send initial login packets
    serverConfigs.forEach(async (serverConfig) => {
      const loginPacket = buildLoginPacket(deviceConfig);
      await this.sendPacket(loginPacket, serverConfig.ip, serverConfig.port, onResponse);
    });

    // Set up intervals for PVT packets
    serverConfigs.forEach((serverConfig) => {
      const interval = setInterval(async () => {
        const pvtPacket = buildPvtPacket(deviceConfig);
        await this.sendPacket(pvtPacket, serverConfig.ip, serverConfig.port, onResponse);
      }, 5000); // Send every 5 seconds

      this.intervals.set(serverConfig.id, interval);
    });
  }

  stopTransmission() {
    console.log('🛑 Stopping all transmissions...');
    this.intervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.intervals.clear();
  }

  isTransmitting(): boolean {
    return this.intervals.size > 0;
  }
}

// Main Device Configuration Screen
const DeviceConfigPage: React.FC = () => {
  const [config, setConfig] = useState<DeviceConfig>({
    backend: 'development',
    ipPortPairs: [{ id: '1', ip: '34.225.227.181', port: '5001' }],
    deviceImei: '866772041471415',
    vendorId: 'VNDR',
    vehicleNumber: 'PB01BV2345',
    networkProvider: 'Airtel',
    firmwareVersion: 'FIRMWAREVER1.0',
    useGpsCoordinates: true,
    latitude: '',
    longitude: '',
  });

  const [httpManager] = useState(() => new HTTPConnectionManager());
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [packetResponses, setPacketResponses] = useState<PacketResponse[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
  const [showResponsesPage, setShowResponsesPage] = useState(false);
  const [showTransmissionPage, setShowTransmissionPage] = useState(false);


  const addIpPortPair = useCallback(() => {
    const newPair: IpPortPair = {
      id: Date.now().toString(),
      ip: '',
      port: '',
    };
    setConfig((prev) => ({
      ...prev,
      ipPortPairs: [...prev.ipPortPairs, newPair],
    }));
  }, []);

  const removeIpPortPair = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      ipPortPairs: prev.ipPortPairs.filter((pair) => pair.id !== id),
    }));
  }, []);

  const updateIpPortPair = useCallback((id: string, field: 'ip' | 'port', value: string) => {
    setConfig((prev) => ({
      ...prev,
      ipPortPairs: prev.ipPortPairs.map((pair) =>
        pair.id === id ? { ...pair, [field]: value } : pair
      ),
    }));
  }, []);

  const updateConfig = useCallback(<K extends keyof DeviceConfig>(
    field: K,
    value: DeviceConfig[K]
  ) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const validateForm = useCallback((): boolean => {
    if (!config.backend) {
      Alert.alert('Validation Error', 'Please select a backend');
      return false;
    }

    const emptyPairs = config.ipPortPairs.filter(pair => !pair.ip.trim() || !pair.port.trim());
    if (emptyPairs.length > 0) {
      Alert.alert('Validation Error', 'Please fill all IP and Port fields');
      return false;
    }

    if (!config.deviceImei.trim() || config.deviceImei.length !== 15) {
      Alert.alert('Validation Error', 'Please enter a valid 15-digit IMEI');
      return false;
    }

    if (!config.vendorId.trim()) {
      Alert.alert('Validation Error', 'Please enter vendor ID');
      return false;
    }

    if (!config.vehicleNumber.trim()) {
      Alert.alert('Validation Error', 'Please enter vehicle number');
      return false;
    }

    if (!config.networkProvider) {
      Alert.alert('Validation Error', 'Please select network provider');
      return false;
    }

    if (!config.useGpsCoordinates && (!config.latitude.trim() || !config.longitude.trim())) {
      Alert.alert('Validation Error', 'Please enter latitude and longitude coordinates');
      return false;
    }

    return true;
  }, [config]);

  const handlePacketResponse = useCallback((response: PacketResponse) => {
    setPacketResponses(prev => [...prev, response]);
    // Auto-scroll to bottom
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  const handleStartTransmission = useCallback(() => {
    if (!validateForm()) {
      return;
    }
    setShowTransmissionPage(true);
  }, [validateForm]);

  const handleStopTransmission = useCallback(() => {
    console.log('🛑 Stopping transmission');

    try {
      httpManager.stopTransmission();
      setIsTransmitting(false);
      Alert.alert('✅ Transmission Stopped', '📡 All packet sending stopped');
    } catch (error) {
      console.error('🚨 Error stopping transmission:', error);
      Alert.alert('Error', `Failed to stop transmission: ${error}`);
    }
  }, [httpManager]);

  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset Configuration',
      'Are you sure you want to reset all fields?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            if (isTransmitting) {
              handleStopTransmission();
            }
            setConfig({
              backend: '',
              ipPortPairs: [{ id: '1', ip: '', port: '' }],
              deviceImei: '',
              vendorId: '',
              vehicleNumber: '',
              networkProvider: '',
              firmwareVersion: '',
              useGpsCoordinates: true,
              latitude: '',
              longitude: '',
            });
            setPacketResponses([]);
          }
        }
      ]
    );
  }, [isTransmitting, handleStopTransmission]);

  const clearResponses = useCallback(() => {
    setPacketResponses([]);
  }, []);

  // If transmission page is to be shown, render it
  if (showTransmissionPage) {
    return (
      <TransmissionPage
        config={config}
        onBack={() => setShowTransmissionPage(false)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#1976D2" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Icon name="settings" size={28} color="#fff" />
          <Text style={styles.headerTitle}>Device Setup</Text>
        </View>
        <TouchableOpacity
          style={styles.resetButton}
          onPress={handleReset}
          activeOpacity={0.8}
        >
          <Icon name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Backend Selection */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="cloud" size={22} color="#1976D2" />
            <Text style={styles.cardTitle}>Backend Configuration</Text>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Select Backend *</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={config.backend}
                onValueChange={(value: string) => updateConfig('backend', value)}
                style={styles.picker}
                dropdownIconColor="#666"
              >
                <Picker.Item label="Choose backend server..." value="" />
                <Picker.Item label="AIS140" value="production" />
              </Picker>
            </View>
          </View>
        </View>

        {/* IP/Port Configuration */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeader}>
              <Icon name="router" size={22} color="#1976D2" />
              <Text style={styles.cardTitle}>Server Configuration</Text>
            </View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={addIpPortPair}
              activeOpacity={0.8}
            >
              <Icon name="add-circle" size={20} color="#4CAF50" />
              <Text style={styles.addButtonText}>Add Server</Text>
            </TouchableOpacity>
          </View>

          {config.ipPortPairs.map((pair, index) => (
            <IpPortPairComponent
              key={pair.id}
              pair={pair}
              index={index}
              onIpChange={(id: string, value: string) => updateIpPortPair(id, 'ip', value)}
              onPortChange={(id: string, value: string) => updateIpPortPair(id, 'port', value)}
              onRemove={removeIpPortPair}
              canRemove={config.ipPortPairs.length > 1}
            />
          ))}
        </View>

        {/* Device Information */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="smartphone" size={22} color="#1976D2" />
            <Text style={styles.cardTitle}>Device Information</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Device IMEI *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter 15-digit IMEI number"
              value={config.deviceImei}
              onChangeText={(value) => updateConfig('deviceImei', value.replace(/\D/g, ''))}
              placeholderTextColor="#999"
              keyboardType="numeric"
              maxLength={15}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Vendor ID *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter vendor identification"
              value={config.vendorId}
              onChangeText={(value) => updateConfig('vendorId', value)}
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Vehicle Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., PB01BV2345"
              value={config.vehicleNumber}
              onChangeText={(value) => updateConfig('vehicleNumber', value.toUpperCase())}
              placeholderTextColor="#999"
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Network Provider *</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={config.networkProvider}
                onValueChange={(value: 'Airtel' | 'Vodafone' | 'BSNL' | '') =>
                  updateConfig('networkProvider', value)
                }
                style={styles.picker}
                dropdownIconColor="#666"
              >
                <Picker.Item label="Select network provider..." value="" />
                <Picker.Item label="Airtel" value="Airtel" />
                <Picker.Item label="Vodafone" value="Vodafone" />
                <Picker.Item label="BSNL" value="BSNL" />
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Firmware Version</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., FIRMWAREVER1.0"
              value={config.firmwareVersion}
              onChangeText={(value) => updateConfig('firmwareVersion', value)}
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* GPS Configuration */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="location-on" size={22} color="#1976D2" />
            <Text style={styles.cardTitle}>GPS Configuration</Text>
          </View>

          <View style={styles.switchContainer}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Use default GPS coordinates</Text>
              <Text style={styles.switchDescription}>
                {config.useGpsCoordinates
                  ? 'Using: 31.589618, 75.875231'
                  : 'Manual coordinates entered'
                }
              </Text>
            </View>
            <Switch
              value={config.useGpsCoordinates}
              onValueChange={(value) => updateConfig('useGpsCoordinates', value)}
              trackColor={{ false: '#E0E0E0', true: '#1976D2' }}
              thumbColor={config.useGpsCoordinates ? '#fff' : '#f4f3f4'}
              ios_backgroundColor="#E0E0E0"
            />
          </View>

          {!config.useGpsCoordinates && (
            <View style={styles.coordinatesSection}>
              <View style={styles.coordinatesRow}>
                <View style={styles.coordinateField}>
                  <Text style={styles.label}>Latitude *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="31.589618"
                    value={config.latitude}
                    onChangeText={(value) => updateConfig('latitude', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#999"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.coordinateField}>
                  <Text style={styles.label}>Longitude *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="75.875231"
                    value={config.longitude}
                    onChangeText={(value) => updateConfig('longitude', value)}
                    keyboardType="numeric"
                    placeholderTextColor="#999"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
              <Text style={styles.coordinateHint}>
                💡 Enter coordinates in decimal degrees format
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Packet Responses Display */}
      {packetResponses.length > 0 && (
        <View style={styles.responsesContainer}>
          <View style={styles.responsesHeader}>
            <Text style={styles.responsesTitle}>
              📡 Packet Responses ({packetResponses.length})
            </Text>
            <TouchableOpacity onPress={clearResponses} style={styles.clearButton}>
              <Icon name="clear-all" size={20} color="#666" />
            </TouchableOpacity>
          </View>
          <ScrollView
            ref={scrollViewRef}
            style={styles.responsesScroll}
            showsVerticalScrollIndicator={true}
          >
            {packetResponses.map((item) => (
              <View key={item.id} style={[
                styles.responseItem,
                item.status === 'error' && styles.responseItemError
              ]}>
                <View style={styles.responseHeader}>
                  <Text style={styles.responseTime}>{item.timestamp}</Text>
                  <Text style={styles.responseServer}>{item.host}:{item.port}</Text>
                  <View style={[
                    styles.statusBadge,
                    item.status === 'success' ? styles.statusSuccess : styles.statusError
                  ]}>
                    <Text style={styles.statusText}>
                      {item.status === 'success' ? '✅' : '❌'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.packetLabel}>📤 Packet:</Text>
                <Text style={styles.packetText} selectable>{item.packet}</Text>
                <Text style={styles.responseLabel}>📥 Response:</Text>
                <Text style={[
                  styles.responseText,
                  item.status === 'error' && styles.responseTextError
                ]} selectable>{item.response}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            isTransmitting ? styles.stopButton : styles.transmitButton
          ]}
          onPress={isTransmitting ? handleStopTransmission : handleStartTransmission}
          activeOpacity={0.9}
        >
          <Icon
            name={isTransmitting ? "stop" : "send"}
            size={20}
            color="#fff"
          />
          <Text style={styles.transmitButtonText}>
            {isTransmitting ? "Stop" : "Start"} Transmission
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// Styles for IpPortPair component
const ipPortStyles = StyleSheet.create({
  container: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
  },
  removeButton: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#FFF5F5',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputContainer: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6C757D',
    marginBottom: 6,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#495057',
  },
});

// Main styles
interface Styles {
  safeArea: ViewStyle;
  header: ViewStyle;
  headerLeft: ViewStyle;
  headerTitle: TextStyle;
  resetButton: ViewStyle;
  scrollView: ViewStyle;
  scrollContent: ViewStyle;
  card: ViewStyle;
  cardHeader: ViewStyle;
  cardHeaderRow: ViewStyle;
  cardTitle: TextStyle;
  inputGroup: ViewStyle;
  label: TextStyle;
  input: ViewStyle & TextStyle;
  pickerWrapper: ViewStyle;
  picker: ViewStyle;
  switchContainer: ViewStyle;
  switchInfo: ViewStyle;
  switchLabel: TextStyle;
  switchDescription: TextStyle;
  coordinatesSection: ViewStyle;
  coordinatesRow: ViewStyle;
  coordinateField: ViewStyle;
  coordinateHint: TextStyle;
  addButton: ViewStyle;
  addButtonText: TextStyle;
  bottomBar: ViewStyle;
  actionButton: ViewStyle;
  transmitButton: ViewStyle;
  stopButton: ViewStyle;
  transmitButtonText: TextStyle;
  responsesContainer: ViewStyle;
  responsesHeader: ViewStyle;
  responsesTitle: TextStyle;
  clearButton: ViewStyle;
  responsesScroll: ViewStyle;
  responseItem: ViewStyle;
  responseItemError: ViewStyle;
  responseHeader: ViewStyle;
  responseTime: TextStyle;
  responseServer: TextStyle;
  statusBadge: ViewStyle;
  statusSuccess: ViewStyle;
  statusError: ViewStyle;
  statusText: TextStyle;
  packetLabel: TextStyle;
  packetText: TextStyle;
  responseLabel: TextStyle;
  responseText: TextStyle;
  responseTextError: TextStyle;
}

const styles = StyleSheet.create<Styles>({
  safeArea: {
    flex: 1,
    backgroundColor: '#1976D2',
  },
  header: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 12,
  },
  resetButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginLeft: 12,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#FAFBFC',
    color: '#495057',
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#DEE2E6',
    borderRadius: 12,
    backgroundColor: '#FAFBFC',
    overflow: 'hidden',
  },
  picker: {
    height: 52,
    color: '#495057',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
  switchInfo: {
    flex: 1,
    marginRight: 16,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 4,
  },
  switchDescription: {
    fontSize: 13,
    color: '#6C757D',
    lineHeight: 18,
  },
  coordinatesSection: {
    marginTop: 16,
  },
  coordinatesRow: {
    flexDirection: 'row',
    gap: 16,
  },
  coordinateField: {
    flex: 1,
  },
  coordinateHint: {
    fontSize: 12,
    color: '#6C757D',
    marginTop: 12,
    fontStyle: 'italic',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4CAF50',
    maxWidth: 80,
  },
  addButtonText: {
    color: '#4CAF50',
    fontWeight: '600',
    marginLeft: 3,
    fontSize: 12,
  },
  bottomBar: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  transmitButton: {
    backgroundColor: '#4CAF50',
  },
  stopButton: {
    backgroundColor: '#F44336',
  },
  transmitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  responsesContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
    maxHeight: 300,
  },
  responsesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  responsesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  clearButton: {
    padding: 4,
    borderRadius: 4,
  },
  responsesScroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  responseItem: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  responseItemError: {
    borderLeftColor: '#F44336',
    backgroundColor: '#FFF5F5',
  },
  responseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  responseTime: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  responseServer: {
    fontSize: 12,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusSuccess: {
    backgroundColor: '#E8F5E8',
  },
  statusError: {
    backgroundColor: '#FFEBEE',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  packetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 4,
  },
  packetText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#333',
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  responseLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 4,
  },
  responseText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 4,
  },
  responseTextError: {
    color: '#F44336',
  },
});

export default DeviceConfigPage;