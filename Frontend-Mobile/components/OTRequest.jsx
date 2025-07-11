import React, { useState, useContext, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Platform,
    RefreshControl,
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import { Modal, Portal, Button, Provider as PaperProvider } from 'react-native-paper';

const OTRequest = ({ navigation }) => {
    const { user } = useContext(AuthContext);
    const [isLoading, setIsLoading] = useState(true);
    const [otRequests, setOTRequests] = useState([]);
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [isApproving, setIsApproving] = useState(false);
    const [remarks, setRemarks] = useState('');
    const [showRemarksInput, setShowRemarksInput] = useState(false);
    const [actionType, setActionType] = useState(''); // 'approve' or 'reject'

    const fetchOTRequests = async (pageNum = 1, reset = false) => {
        if (!user) return;

        try {
            setIsLoading(true);
            const response = await api.get('/ot', {
                params: {
                    limit: 30,
                    page: pageNum,
                    sort: 'createdAt: -1',
                    department: user.department?._id || user.department,
                    excludeSelf: true,
                    status: 'pending' // Only fetch pending OT requests for approval
                }
            });

            // Client-side filtering as an extra precaution
            const userId = user._id || user.id;
            const filteredOTs = (response.data.otClaims || []).filter(record => {
                const recordUserId = record.employee?._id || record.employee?.id || record.employee;
                return recordUserId !== userId; // Exclude HOD's own records
            });

            if (reset) {
                setOTRequests(filteredOTs);
            } else {
                setOTRequests(prev => [...prev, ...filteredOTs]);
            }

            setTotalPages(Math.ceil(response.data.total / response.data.limit));
        } catch (error) {
            console.error('Error fetching OT requests:', error);
            Alert.alert('Error', error.response?.data?.message || 'Failed to fetch OT requests');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchOTRequests(1, true);
        }
    }, [user]);

    const getFinalStatus = (status) => {
        if (!status) return 'Pending';
        if (status.hod === 'Rejected' || status.ceo === 'Rejected') return 'Rejected';
        if (status.ceo === 'Approved') return 'Approved';
        if (status.hod === 'Approved') return 'Approved by HOD';
        return 'Pending';
    }

    const getStatusColor = (status) => {
        if (status === 'Rejected') return '#ef4444';
        if (status === 'Approved') return '#10b981';
        if (status.includes('Approved by')) return '#3b82f6';
        return '#f59e0b';
    }

    const handleRefresh = () => {
        setRefreshing(true);
        setPage(1);
        fetchOTRequests(1, true);
    };

    const handleApproveOT = async (otId, status) => {
        // If no remarks input is shown, show it first
        if (!showRemarksInput) {
            setActionType(status === 'Approved' ? 'approve' : 'reject');
            setShowRemarksInput(true);
            return;
        }

        try {
            setIsApproving(true);
            await api.put(`/ot/${otId}/approve`, {
                status,
                remarks: remarks || (status === 'Approved' ? 'Approved by HOD' : 'Rejected by HOD')
            });

            // Create the updated status object
            const updatedStatus = {
                ...selectedRecord.status,
                hod: status,
                updatedAt: new Date().toISOString(),
                remarks: remarks || (status === 'Approved' ? 'Approved by HOD' : 'Rejected by HOD')
            };

            // Update the otRequests array
            setOTRequests(prevRequests =>
                prevRequests.map(req =>
                    req._id === otId
                        ? {
                            ...req,
                            status: {
                                ...req.status,
                                hod: status,
                                updatedAt: new Date().toISOString(),
                                remarks: remarks || (status === 'Approved' ? 'Approved by HOD' : 'Rejected by HOD')
                            }
                        }
                        : req
                )
            );

            // If modal is open for this OT, update the selected record
            if (selectedRecord && selectedRecord._id === otId) {
                setSelectedRecord(prev => ({
                    ...prev,
                    status: updatedStatus,
                    remarks: updatedStatus.remarks
                }));
            }

            setRemarks('');
            setShowRemarksInput(false);
            setActionType('');

            Alert.alert('Success', `OT request ${status.toLowerCase()} successfully`);

            // Refresh the list after approval/rejection
            fetchOTRequests(1, true);
        } catch (error) {
            console.error('Error processing OT request:', error);
            Alert.alert('Error', error.response?.data?.message || 'Failed to process OT request');
        } finally {
            setIsApproving(false);
        }
    };

    // Render loading state
    if (isLoading && page === 1) {
        return (
            <View style={styles.loader}>
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    // Main component render
    return (
        <PaperProvider>
            <View style={styles.container}>
                <ScrollView
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            colors={['#2563eb']}
                            tintColor="#2563eb"
                        />
                    }
                >
                    <View style={{ marginTop: -20, marginBottom: 40 }}>
                        <View style={styles.contentContainer}>
                            <Text style={styles.sectionTitle}>Department OT Requests</Text>

                            {Array.isArray(otRequests) && otRequests.length === 0 ? (
                                <Text style={styles.noRecords}>No OT requests found</Text>
                            ) : (
                                <View style={styles.tableContainer}>
                                    <View style={[styles.row, styles.tableHeader]}>
                                        <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>Date</Text>
                                        <Text style={[styles.cell, styles.headerCell, { flex: 1 }]}>Hours</Text>
                                        <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>Status</Text>
                                        <Text style={[styles.cell, styles.headerCell, { flex: 1 }]}>Details</Text>
                                    </View>

                                    {otRequests.map((otRequest) => {
                                        const date = otRequest.date ? new Date(otRequest.date) : null;
                                        const status = getFinalStatus(otRequest.status);

                                        return (
                                            <View style={styles.row} key={otRequest._id}>
                                                <Text style={[styles.cell, { flex: 2 }]}>
                                                    {date && !isNaN(date.getTime())
                                                        ? date.toLocaleDateString()
                                                        : 'N/A'}
                                                </Text>
                                                <Text style={[styles.cell, { flex: 1 }]}>
                                                    {otRequest.hours || 'N/A'}
                                                </Text>
                                                <View style={[styles.cell, { flex: 2 }]}>
                                                    <Text
                                                        style={[
                                                            styles.statusBadge,
                                                            {
                                                                backgroundColor: getStatusColor(status) + '20',
                                                                color: getStatusColor(status),
                                                            }
                                                        ]}
                                                    >
                                                        {status}
                                                    </Text>
                                                </View>
                                                <View style={[styles.cell, { flex: 1 }]}>
                                                    <TouchableOpacity
                                                        style={styles.actionButton}
                                                        onPress={() => {
                                                            setSelectedRecord(otRequest);
                                                            setModalVisible(true);
                                                        }}
                                                    >
                                                        <Text style={styles.actionButtonText}>View</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    </View>
                </ScrollView>
            </View >

            {/* OT Request Details Modal */}
            <Portal>
                < Modal
                    visible={modalVisible}
                    onDismiss={() => setModalVisible(false)}
                    contentContainerStyle={styles.modalContainer}
                >
                    {selectedRecord && (
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>OT Request Details</Text>

                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Employee:</Text>
                                <Text style={styles.detailValue}>
                                    {selectedRecord.employee?.name || 'N/A'}
                                </Text>
                            </View>

                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Date:</Text>
                                <Text style={styles.detailValue}>
                                    {selectedRecord.date
                                        ? new Date(selectedRecord.date).toLocaleDateString()
                                        : 'N/A'}
                                </Text>
                            </View>

                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Hours:</Text>
                                <Text style={styles.detailValue}>
                                    {selectedRecord.hours || 'N/A'}
                                </Text>
                            </View>

                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { marginBottom: 8 }]}>Approval Status:</Text>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>• HOD:</Text>
                                    {selectedRecord.status?.hod === 'Approved' || selectedRecord.status?.hod === 'Rejected' ? (
                                        <Text style={[
                                            styles.detailValue,
                                            {
                                                color: selectedRecord.status?.hod === 'Approved' ? '#10b981' : '#ef4444'
                                            }
                                        ]}>
                                            {selectedRecord.status?.hod}
                                        </Text>
                                    ) : (
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <TouchableOpacity
                                                style={[styles.approveButton, isApproving && styles.disabledButton]}
                                                onPress={() => handleApproveOT(selectedRecord._id, 'Approved')}
                                                disabled={isApproving}
                                            >
                                                <Text style={styles.approveButtonText}>
                                                    {isApproving ? 'Approving...' : 'Approve'}
                                                </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.rejectButton, isApproving && styles.disabledButton]}
                                                onPress={() => handleApproveOT(selectedRecord._id, 'Rejected')}
                                                disabled={isApproving}
                                            >
                                                <Text style={styles.rejectButtonText}>Reject</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>

                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>• CEO:</Text>
                                    <Text style={[
                                        styles.detailValue,
                                        {
                                            color: selectedRecord.status?.ceo === 'Approved' ? '#10b981' :
                                                selectedRecord.status?.ceo === 'Rejected' ? '#ef4444' : '#64748b'
                                        }
                                    ]}>
                                        {selectedRecord.status?.ceo || 'Pending'}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Remarks:</Text>
                                <Text style={styles.detailValue}>
                                    {selectedRecord.remarks || 'No remarks'}
                                </Text>
                            </View>

                            {/* Remarks Input */}
                            {showRemarksInput && (
                                <View style={styles.remarksContainer}>
                                    <TextInput
                                        style={styles.remarksInput}
                                        placeholder="Enter remarks"
                                        value={remarks}
                                        onChangeText={setRemarks}
                                        multiline
                                        numberOfLines={3}
                                    />
                                    <View style={styles.remarksButtons}>
                                        <Button
                                            mode="outlined"
                                            onPress={() => {
                                                setShowRemarksInput(false);
                                                setRemarks('');
                                                setActionType('');
                                            }}
                                            style={styles.remarksButton}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            mode="contained"
                                            onPress={() => handleApproveOT(
                                                selectedRecord._id,
                                                actionType === 'approve' ? 'Approved' : 'Rejected'
                                            )}
                                            loading={isApproving}
                                            disabled={isApproving || (actionType === 'reject' && !remarks.trim())}
                                            style={styles.remarksButton}
                                        >
                                            Submit
                                        </Button>
                                    </View>
                                </View>
                            )}

                            <Button
                                mode="outlined"
                                onPress={() => setModalVisible(false)}
                                style={styles.closeButton}
                            >
                                Close
                            </Button>
                        </View>
                    )}
                </Modal >
            </Portal>
        </PaperProvider >
    );
};

// Rejection Dialog Component
const RejectionDialog = ({
    visible,
    onClose,
    onConfirm,
    remarks,
    onRemarksChange
}) => (
    <Modal
        visible={visible}
        animationType="fade"
        transparent={true}
        onRequestClose={onClose}
    >
        <View style={styles.dialogOverlay}>
            <View style={styles.dialogContent}>
                <Text style={styles.dialogTitle}>Reject OT Claim</Text>
                <Text style={styles.dialogMessage}>
                    Please provide a reason for rejecting this OT claim.
                </Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={remarks}
                    onChangeText={onRemarksChange}
                    placeholder="Enter reason for rejection"
                    placeholderTextColor="#999"
                    multiline
                    numberOfLines={4}
                />
                <View style={styles.dialogButtons}>
                    <TouchableOpacity
                        style={[styles.dialogButton, styles.cancelButton]}
                        onPress={onClose}
                    >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.dialogButton, styles.confirmButton]}
                        onPress={onConfirm}
                    >
                        <Text style={styles.confirmButtonText}>Confirm Rejection</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    </Modal>
);

const styles = StyleSheet.create({
    disabledButton: {
        backgroundColor: '#f3f4f6',
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 5,
        marginBottom: 15,
        backgroundColor: '#fff',
    },
    picker: {
        width: '100%',
        height: Platform.OS === 'ios' ? 150 : 50,
    },
    pickerItem: {
        fontSize: 16,
        color: '#000',
    },
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        padding: 15,
    },
    card: {
        marginBottom: 20,
        borderRadius: 10,
        elevation: 3,
        backgroundColor: '#fff',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
        color: '#333',
    },
    formGroup: {
        marginBottom: 15,
    },
    label: {
        fontSize: 14,
        marginBottom: 5,
        color: '#555',
        fontWeight: '500',
    },
    actionButtonText: {
        color: '#2563eb',
        fontWeight: '500',
    },
    approveButton: {
        backgroundColor: '#10b981',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
        marginRight: 8,
    },
    rejectButton: {
        backgroundColor: '#ef4444',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
    },
    approveButtonText: {
        color: 'white',
        fontWeight: '500',
    },
    rejectButtonText: {
        color: 'white',
        fontWeight: '500',
    },
    button: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#d1d5db',
        backgroundColor: '#f9fafb',
    },
    buttonText: {
        color: '#4b5563',
        fontWeight: '500',
    },
    primaryButton: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    textArea: {
        minHeight: 80,
        textAlignVertical: 'top',
        padding: 10,
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 4,
        backgroundColor: '#fff',
    },
    input: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#9ca3af',
        borderRadius: 5,
        padding: 12,
        fontSize: 16,
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },


    loader: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 24,
        marginBottom: 16,
        color: '#1e40af',
    },
    tableHeader: {
        backgroundColor: '#f1f5f9',
        flexDirection: 'row',
        padding: 12,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
    },
    headerCell: {
        fontWeight: 'bold',
        color: '#334155',
        fontSize: 14,
    },
    row: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: '#e2e8f0',
        padding: 12,
        alignItems: 'center',
    },
    cell: {
        paddingHorizontal: 4,
    },
    actionButton: {
        padding: 6,
        borderRadius: 4,
        backgroundColor: '#3b82f6',
        alignSelf: 'flex-start',
    },
    actionButtonText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '500',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        alignSelf: 'flex-start',
        fontSize: 12,
        fontWeight: '500',
    },
    modalContainer: {
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 20,
        maxHeight: '80%',
        justifyContent: 'center',
        flex: 1,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#1e40af',
        textAlign: 'center',
    },
    detailRow: {
        flexDirection: 'row',
        marginBottom: 12,
        alignItems: 'flex-start',
    },
    detailLabel: {
        width: 140,
        fontWeight: '600',
        color: '#475569',
        fontSize: 14,
    },
    detailValue: {
        flex: 1,
        fontSize: 14,
        color: '#1e293b',
    },
    noRecords: {
        textAlign: 'center',
        color: '#64748b',
        marginTop: 16,
        fontStyle: 'italic',
    },
});

export default OTRequest;