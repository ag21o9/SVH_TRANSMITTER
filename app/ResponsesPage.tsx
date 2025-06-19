import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    Share,
    StatusBar,
    StyleSheet,
    Text,
    TextStyle,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface PacketResponse {
  id: string;
  timestamp: string;
  packet: string;
  host: string;
  port: string;
  response: string;
  status: 'success' | 'error';
}

interface ResponsesPageProps {
  responses: PacketResponse[];
  isTransmitting: boolean;
  onBack: () => void;
  onClear: () => void;
}

const ResponsesPage: React.FC<ResponsesPageProps> = ({
  responses,
  isTransmitting,
  onBack,
  onClear,
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Auto-scroll to bottom when new responses arrive
  useEffect(() => {
    if (responses.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [responses.length]);

  // Pulse animation for live indicator
  useEffect(() => {
    if (isTransmitting) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isTransmitting]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const shareResponses = async () => {
    try {
      const content = responses.map(item => 
        `[${item.timestamp}] ${item.host}:${item.port} - ${item.status.toUpperCase()}\n` +
        `Packet: ${item.packet}\n` +
        `Response: ${item.response}\n\n`
      ).join('');
      
      await Share.share({
        message: `TrackerSHV Transmission Log\n\n${content}`,
        title: 'Packet Responses',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const getStatusStats = () => {
    const success = responses.filter(r => r.status === 'success').length;
    const error = responses.filter(r => r.status === 'error').length;
    return { success, error, total: responses.length };
  };

  const stats = getStatusStats();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#1A237E" />
      
      {/* Beautiful Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={onBack}
            activeOpacity={0.8}
          >
            <Icon name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Transmission Log</Text>
            <View style={styles.liveIndicator}>
              {isTransmitting && (
                <Animated.View style={[
                  styles.liveDot, 
                  { transform: [{ scale: pulseAnim }] }
                ]} />
              )}
              <Text style={styles.liveText}>
                {isTransmitting ? 'LIVE' : 'STOPPED'}
              </Text>
            </View>
          </View>
          
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.headerButton} 
              onPress={shareResponses}
              activeOpacity={0.8}
            >
              <Icon name="share" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerButton} 
              onPress={onClear}
              activeOpacity={0.8}
            >
              <Icon name="clear-all" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Bar */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Icon name="assessment" size={18} color="#fff" />
            <Text style={styles.statText}>Total: {stats.total}</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="check-circle" size={18} color="#4CAF50" />
            <Text style={styles.statText}>Success: {stats.success}</Text>
          </View>
          <View style={styles.statItem}>
            <Icon name="error" size={18} color="#FF5252" />
            <Text style={styles.statText}>Errors: {stats.error}</Text>
          </View>
        </View>
      </View>

      {/* Content */}
      {responses.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Icon name="radio" size={80} color="#B0BEC5" />
          </View>
          <Text style={styles.emptyTitle}>No Transmissions Yet</Text>
          <Text style={styles.emptySubtitle}>
            Start transmission to see packet responses here
          </Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {responses.map((item, index) => (
            <ResponseCard key={item.id} response={item} index={index} />
          ))}
        </ScrollView>
      )}

      {/* Floating Scroll to Bottom Button */}
      {responses.length > 5 && (
        <TouchableOpacity
          style={styles.scrollToBottomButton}
          onPress={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          activeOpacity={0.8}
        >
          <Icon name="keyboard-arrow-down" size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

// Individual Response Card Component
const ResponseCard: React.FC<{ response: PacketResponse; index: number }> = ({ 
  response, 
  index 
}) => {
  const [expanded, setExpanded] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      delay: index * 50,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[
      styles.responseCard,
      response.status === 'error' ? styles.responseCardError : styles.responseCardSuccess,
      { opacity: fadeAnim }
    ]}>
      {/* Card Header */}
      <TouchableOpacity 
        style={styles.cardHeader} 
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeaderLeft}>
          <View style={[
            styles.statusIconContainer,
            response.status === 'success' ? styles.statusSuccess : styles.statusError
          ]}>
            <Icon 
              name={response.status === 'success' ? 'check-circle' : 'error'} 
              size={20} 
              color="#fff" 
            />
          </View>
          <View style={styles.cardHeaderInfo}>
            <Text style={styles.cardTimestamp}>{response.timestamp}</Text>
            <View style={styles.serverInfo}>
              <Icon name="dns" size={14} color="#64748B" />
              <Text style={styles.cardServer}>{response.host}:{response.port}</Text>
            </View>
          </View>
        </View>
        <Icon 
          name={expanded ? "expand-less" : "expand-more"} 
          size={24} 
          color="#64748B" 
        />
      </TouchableOpacity>

      {/* Expandable Content */}
      {expanded && (
        <View style={styles.cardContent}>
          <View style={styles.contentSection}>
            <View style={styles.sectionHeader}>
              <Icon name="send" size={16} color="#2196F3" />
              <Text style={styles.sectionTitle}>Packet Sent</Text>
            </View>
            <View style={styles.packetContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={styles.packetText} selectable>
                  {response.packet}
                </Text>
              </ScrollView>
            </View>
          </View>

          <View style={styles.contentSection}>
            <View style={styles.sectionHeader}>
              <Icon name="reply" size={16} color="#9C27B0" />
              <Text style={styles.sectionTitle}>Server Response</Text>
            </View>
            <View style={[
              styles.responseContainer,
              response.status === 'error' && styles.responseContainerError
            ]}>
              <Text style={[
                styles.responseText,
                response.status === 'error' && styles.responseTextError
              ]} selectable>
                {response.response}
              </Text>
            </View>
          </View>
        </View>
      )}
    </Animated.View>
  );
};

// Styles
interface Styles {
  safeArea: ViewStyle;
  header: ViewStyle;
  headerTop: ViewStyle;
  backButton: ViewStyle;
  headerCenter: ViewStyle;
  headerTitle: TextStyle;
  liveIndicator: ViewStyle;
  liveDot: ViewStyle;
  liveText: TextStyle;
  headerActions: ViewStyle;
  headerButton: ViewStyle;
  statsBar: ViewStyle;
  statItem: ViewStyle;
  statText: TextStyle;
  emptyState: ViewStyle;
  emptyIcon: ViewStyle;
  emptyTitle: TextStyle;
  emptySubtitle: TextStyle;
  scrollView: ViewStyle;
  scrollContent: ViewStyle;
  responseCard: ViewStyle;
  responseCardSuccess: ViewStyle;
  responseCardError: ViewStyle;
  cardHeader: ViewStyle;
  cardHeaderLeft: ViewStyle;
  statusIconContainer: ViewStyle;
  statusSuccess: ViewStyle;
  statusError: ViewStyle;
  cardHeaderInfo: ViewStyle;
  cardTimestamp: TextStyle;
  serverInfo: ViewStyle;
  cardServer: TextStyle;
  cardContent: ViewStyle;
  contentSection: ViewStyle;
  sectionHeader: ViewStyle;
  sectionTitle: TextStyle;
  packetContainer: ViewStyle;
  packetText: TextStyle;
  responseContainer: ViewStyle;
  responseContainerError: ViewStyle;
  responseText: TextStyle;
  responseTextError: TextStyle;
  scrollToBottomButton: ViewStyle;
}

const styles = StyleSheet.create<Styles>({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#1A237E',
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 6,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  responseCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderLeftWidth: 4,
  },
  responseCardSuccess: {
    borderLeftColor: '#4CAF50',
  },
  responseCardError: {
    borderLeftColor: '#FF5252',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusIconContainer: {
    padding: 8,
    borderRadius: 12,
    marginRight: 12,
  },
  statusSuccess: {
    backgroundColor: '#4CAF50',
  },
  statusError: {
    backgroundColor: '#FF5252',
  },
  cardHeaderInfo: {
    flex: 1,
  },
  cardTimestamp: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  serverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardServer: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 4,
    fontWeight: '500',
  },
  cardContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  contentSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginLeft: 6,
  },
  packetContainer: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  packetText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#334155',
    lineHeight: 16,
  },
  responseContainer: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  responseContainerError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  responseText: {
    fontSize: 14,
    color: '#166534',
    fontWeight: '500',
    lineHeight: 20,
  },
  responseTextError: {
    color: '#DC2626',
  },
  scrollToBottomButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#2196F3',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});

export default ResponsesPage;