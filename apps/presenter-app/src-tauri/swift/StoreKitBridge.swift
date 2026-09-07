import Foundation
import StoreKit

public typealias LayerTalkStoreKitCallback = @convention(c) (
    UnsafeMutableRawPointer?, UnsafePointer<CChar>?
) -> Void

private func send(
    _ object: [String: Any],
    context: UnsafeMutableRawPointer?,
    callback: LayerTalkStoreKitCallback?
) {
    guard let callback else { return }
    let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{\"status\":\"error\",\"message\":\"Encoding failed\"}".utf8)
    let json = String(data: data, encoding: .utf8) ?? "{\"status\":\"error\"}"
    json.withCString { callback(context, $0) }
}

private func failure(_ error: Error, context: UnsafeMutableRawPointer?, callback: LayerTalkStoreKitCallback?) {
    send(["status": "error", "message": String(describing: error)], context: context, callback: callback)
}

@_cdecl("layertalk_storekit_product")
public func layertalkStoreKitProduct(
    _ productID: UnsafePointer<CChar>?,
    _ context: UnsafeMutableRawPointer?,
    _ callback: LayerTalkStoreKitCallback?
) {
    guard let productID else {
        send(["status": "error", "message": "Missing product identifier"], context: context, callback: callback)
        return
    }
    let identifier = String(cString: productID)
    Task {
        do {
            guard let product = try await Product.products(for: [identifier]).first else {
                send(["status": "unavailable"], context: context, callback: callback)
                return
            }
            send([
                "status": "ready",
                "productId": product.id,
                "displayName": product.displayName,
                "displayPrice": product.displayPrice,
            ], context: context, callback: callback)
        } catch { failure(error, context: context, callback: callback) }
    }
}

@_cdecl("layertalk_storekit_purchase")
public func layertalkStoreKitPurchase(
    _ productID: UnsafePointer<CChar>?,
    _ attemptID: UnsafePointer<CChar>?,
    _ context: UnsafeMutableRawPointer?,
    _ callback: LayerTalkStoreKitCallback?
) {
    guard let productID, let attemptID,
          let token = UUID(uuidString: String(cString: attemptID)) else {
        send(["status": "error", "message": "Invalid purchase arguments"], context: context, callback: callback)
        return
    }
    let identifier = String(cString: productID)
    Task {
        do {
            guard let product = try await Product.products(for: [identifier]).first else {
                send(["status": "unavailable"], context: context, callback: callback)
                return
            }
            switch try await product.purchase(options: [.appAccountToken(token)]) {
            case .success(let verification):
                switch verification {
                case .verified(let transaction):
                    // The Rust/JS side finishes only after server fulfillment succeeds.
                    send([
                        "status": "success",
                        "transactionId": String(transaction.id),
                        "productId": transaction.productID,
                        "signedTransaction": verification.jwsRepresentation,
                    ], context: context, callback: callback)
                case .unverified(_, let error):
                    failure(error, context: context, callback: callback)
                }
            case .pending:
                send(["status": "pending"], context: context, callback: callback)
            case .userCancelled:
                send(["status": "userCancelled"], context: context, callback: callback)
            @unknown default:
                send(["status": "error", "message": "Unknown purchase result"], context: context, callback: callback)
            }
        } catch { failure(error, context: context, callback: callback) }
    }
}

private func describe(_ verification: VerificationResult<Transaction>, _ transaction: Transaction) -> [String: Any] {
    [
        "status": "transaction",
        "transactionId": String(transaction.id),
        "productId": transaction.productID,
        "signedTransaction": verification.jwsRepresentation,
    ]
}

private func unfinishedTransactions() async -> [[String: Any]] {
    var values: [[String: Any]] = []
    for await verification in Transaction.unfinished {
        guard case .verified(let transaction) = verification else { continue }
        values.append(describe(verification, transaction))
    }
    return values
}

/// Every transaction StoreKit still knows about for this customer, including
/// finished ones. `Transaction.unfinished` cannot restore a non-renewing
/// subscription onto a second Mac, because the original purchase was finished
/// on the first one. Revoked transactions are dropped here so a refunded pass
/// is never re-applied.
private func allTransactions() async -> [[String: Any]] {
    var values: [[String: Any]] = []
    for await verification in Transaction.all {
        guard case .verified(let transaction) = verification else { continue }
        if transaction.revocationDate != nil { continue }
        values.append(describe(verification, transaction))
    }
    return values
}

@_cdecl("layertalk_storekit_unfinished")
public func layertalkStoreKitUnfinished(
    _ context: UnsafeMutableRawPointer?,
    _ callback: LayerTalkStoreKitCallback?
) {
    Task {
        let transactions = await unfinishedTransactions()
        send(["status": "success", "transactions": transactions], context: context, callback: callback)
    }
}

@_cdecl("layertalk_storekit_all")
public func layertalkStoreKitAll(
    _ context: UnsafeMutableRawPointer?,
    _ callback: LayerTalkStoreKitCallback?
) {
    Task {
        let transactions = await allTransactions()
        send(["status": "success", "transactions": transactions], context: context, callback: callback)
    }
}

@_cdecl("layertalk_storekit_finish")
public func layertalkStoreKitFinish(
    _ transactionID: UnsafePointer<CChar>?,
    _ context: UnsafeMutableRawPointer?,
    _ callback: LayerTalkStoreKitCallback?
) {
    guard let transactionID, let wanted = UInt64(String(cString: transactionID)) else {
        send(["status": "error", "message": "Invalid transaction identifier"], context: context, callback: callback)
        return
    }
    Task {
        for await verification in Transaction.unfinished {
            guard case .verified(let transaction) = verification, transaction.id == wanted else { continue }
            await transaction.finish()
            send(["status": "finished", "transactionId": String(transaction.id)], context: context, callback: callback)
            return
        }
        // Idempotent: it may already have been finished after a previous successful response.
        send(["status": "finished", "transactionId": String(wanted)], context: context, callback: callback)
    }
}

@_cdecl("layertalk_storekit_start_updates")
public func layertalkStoreKitStartUpdates(
    _ context: UnsafeMutableRawPointer?,
    _ callback: LayerTalkStoreKitCallback?
) {
    Task.detached {
        for await verification in Transaction.updates {
            guard case .verified(let transaction) = verification else { continue }
            send([
                "status": "transaction",
                "transactionId": String(transaction.id),
                "productId": transaction.productID,
                "signedTransaction": verification.jwsRepresentation,
            ], context: context, callback: callback)
        }
    }
}
